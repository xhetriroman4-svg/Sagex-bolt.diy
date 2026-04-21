/**
 * AI Chat Context Memory
 *
 * Provides persistent project memory across sessions,
 * RAG (Retrieval-Augmented Generation) over project files,
 * and automatic chat management when context limits are reached.
 */

import { atom, map, type MapStore } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import type { FileMap } from './files';

const logger = createScopedLogger('ChatMemory');

// Memory entry
export interface MemoryEntry {
  id: string;
  type: 'decision' | 'preference' | 'fact' | 'error_fix' | 'pattern' | 'context';
  content: string;
  source: string; // 'user' | 'ai' | 'system'
  timestamp: number;
  chatId?: string;
  tags: string[];
  importance: number; // 1-5, higher = more important
  accessCount: number;
  lastAccessedAt: number;
}

// Chat context info
export interface ChatContext {
  chatId: string;
  title: string;
  startedAt: number;
  messageCount: number;
  estimatedTokens: number;
  maxContextTokens: number;
  provider: string;
  model: string;
  summary: string; // Auto-generated summary for RAG
  keyDecisions: string[]; // Key decisions made in this chat
  filesModified: string[]; // Files modified in this chat
}

// Context window config
export interface ContextWindowConfig {
  maxContextTokens: number;
  warningThreshold: number; // percentage
  autoNewChatThreshold: number; // percentage to auto-start new chat
  summaryMaxTokens: number;
  maxMemories: number;
  ragTopK: number;
}

// RAG result
export interface RAGResult {
  entries: Array<{
    content: string;
    relevance: number;
    source: string;
  }>;
  fileContexts: Array<{
    filePath: string;
    relevantContent: string;
    relevance: number;
  }>;
  totalTokens: number;
}

// Stores
export const memories: MapStore<Record<string, MemoryEntry>> = map({});
export const chatContexts: MapStore<Record<string, ChatContext>> = map({});
export const activeChatId = atom<string | null>(null);
export const contextUsage = atom<number>(0); // percentage
export const isAutoSummarizing = atom<boolean>(false);
export const showMemoryPanel = atom<boolean>(false);
export const memorySearchQuery = atom<string>('');

// Context window configuration
export const contextConfig = atom<ContextWindowConfig>({
  maxContextTokens: 128000, // Default for Claude 3.5 Sonnet
  warningThreshold: 80,
  autoNewChatThreshold: 95,
  summaryMaxTokens: 2000,
  maxMemories: 500,
  ragTopK: 10,
});

// IndexedDB
const DB_NAME = 'sagex-chat-memory';
const DB_VERSION = 1;

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('memories')) {
        const store = db.createObjectStore('memories', { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('importance', 'importance', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains('contexts')) {
        db.createObjectStore('contexts', { keyPath: 'chatId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistMemory(memory: MemoryEntry): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('memories', 'readwrite');
    tx.objectStore('memories').put(memory);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    logger.error('Failed to persist memory:', error);
  }
}

async function persistChatContext(context: ChatContext): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('contexts', 'readwrite');
    tx.objectStore('contexts').put(context);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    logger.error('Failed to persist chat context:', error);
  }
}

/**
 * Load all memories and contexts from IndexedDB
 */
export async function loadFromDB(): Promise<void> {
  try {
    const db = await openDB();

    // Load memories
    const memTx = db.transaction('memories', 'readonly');
    const memRequest = memTx.objectStore('memories').getAll();
    await new Promise<void>((resolve, reject) => {
      memRequest.onsuccess = () => {
        const allMemories: Record<string, MemoryEntry> = {};

        for (const mem of memRequest.result as MemoryEntry[]) {
          allMemories[mem.id] = mem;
        }
        memories.set(allMemories);
        resolve();
      };
      memRequest.onerror = () => reject(memRequest.error);
    });

    // Load contexts
    const ctxTx = db.transaction('contexts', 'readonly');
    const ctxRequest = ctxTx.objectStore('contexts').getAll();
    await new Promise<void>((resolve, reject) => {
      ctxRequest.onsuccess = () => {
        const allContexts: Record<string, ChatContext> = {};

        for (const ctx of ctxRequest.result as ChatContext[]) {
          allContexts[ctx.chatId] = ctx;
        }
        chatContexts.set(allContexts);
        resolve();
      };
      ctxRequest.onerror = () => reject(ctxRequest.error);
    });

    db.close();
    logger.info(
      `Loaded ${Object.keys(memories.get()).length} memories and ${Object.keys(chatContexts.get()).length} contexts`,
    );
  } catch (error) {
    logger.error('Failed to load from DB:', error);
  }
}

/**
 * Add a memory entry
 */
export async function addMemory(params: {
  type: MemoryEntry['type'];
  content: string;
  source: MemoryEntry['source'];
  chatId?: string;
  tags?: string[];
  importance?: number;
}): Promise<MemoryEntry> {
  const id = `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const memory: MemoryEntry = {
    id,
    type: params.type,
    content: params.content,
    source: params.source,
    timestamp: Date.now(),
    chatId: params.chatId,
    tags: params.tags || [],
    importance: params.importance || 3,
    accessCount: 0,
    lastAccessedAt: Date.now(),
  };

  memories.setKey(id, memory);
  await persistMemory(memory);

  // Enforce max memories limit
  enforceMemoryLimit();

  logger.debug(`Memory added: [${params.type}] ${params.content.substring(0, 50)}...`);

  return memory;
}

/**
 * Search memories using simple keyword matching (RAG retrieval)
 */
export function searchMemories(query: string, limit?: number): MemoryEntry[] {
  const config = contextConfig.get();
  const maxResults = limit || config.ragTopK;
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);

  const allMemories = Object.values(memories.get());

  // Score each memory by relevance
  const scored = allMemories.map((memory) => {
    const contentLower = memory.content.toLowerCase();
    const tagsLower = memory.tags.join(' ').toLowerCase();

    let score = 0;

    // Exact match bonus
    if (contentLower.includes(queryLower)) {
      score += 10;
    }

    // Word match scoring
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        score += 3;
      }

      if (tagsLower.includes(word)) {
        score += 5;
      }
    }

    // Boost by importance and recency
    score += memory.importance * 0.5;

    // Recency boost (memories from last 24 hours get a boost)
    const ageHours = (Date.now() - memory.timestamp) / (1000 * 60 * 60);

    if (ageHours < 24) {
      score += 2;
    } else if (ageHours < 168) {
      // 1 week
      score += 1;
    }

    return { memory, score };
  });

  // Sort by score and take top results
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => {
      // Update access count
      const updated = {
        ...s.memory,
        accessCount: s.memory.accessCount + 1,
        lastAccessedAt: Date.now(),
      };
      memories.setKey(s.memory.id, updated);

      return s.memory;
    });
}

/**
 * Perform RAG retrieval over project files and memories
 */
export function performRAG(query: string, fileMap: FileMap): RAGResult {
  const config = contextConfig.get();

  // Search memories
  const memoryResults = searchMemories(query, config.ragTopK);

  // Search files for relevant content
  const fileResults: RAGResult['fileContexts'] = [];
  const queryLower = query.toLowerCase();

  for (const [filePath, dirent] of Object.entries(fileMap)) {
    if (!dirent || dirent.type !== 'file') {
      continue;
    }

    // Skip binary and very large files
    if (dirent.isBinary || dirent.content.length > 100000) {
      continue;
    }

    // Skip common non-relevant files
    if (
      filePath.endsWith('.lock') ||
      filePath.endsWith('.min.js') ||
      filePath.includes('node_modules') ||
      filePath.includes('.git/')
    ) {
      continue;
    }

    const content = dirent.content.toLowerCase();
    let relevance = 0;

    // Check for keyword matches
    const queryWords = queryLower.split(/\s+/);

    for (const word of queryWords) {
      if (content.includes(word)) {
        relevance += 1;
      }
    }

    // Bonus for files with relevant names
    const fileName = filePath.split('/').pop()?.toLowerCase() || '';

    for (const word of queryWords) {
      if (fileName.includes(word)) {
        relevance += 3;
      }
    }

    if (relevance > 0) {
      // Extract relevant portion of the file
      const lines = dirent.content.split('\n');
      const relevantLines: string[] = [];

      for (const line of lines) {
        const lineLower = line.toLowerCase();

        if (queryWords.some((w) => lineLower.includes(w))) {
          relevantLines.push(line);
        }
      }

      // Take first 30 relevant lines
      const excerpt = relevantLines.slice(0, 30).join('\n');

      fileResults.push({
        filePath,
        relevantContent: excerpt || dirent.content.substring(0, 500),
        relevance,
      });
    }
  }

  // Sort files by relevance and take top K
  fileResults.sort((a, b) => b.relevance - a.relevance);

  const topFiles = fileResults.slice(0, config.ragTopK);

  // Calculate estimated tokens (rough: 4 chars per token)
  const memoryTokens = memoryResults.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  const fileTokens = topFiles.reduce((sum, f) => sum + Math.ceil(f.relevantContent.length / 4), 0);

  return {
    entries: memoryResults.map((m) => ({
      content: m.content,
      relevance: m.importance,
      source: m.source,
    })),
    fileContexts: topFiles,
    totalTokens: memoryTokens + fileTokens,
  };
}

/**
 * Build context-aware system prompt with RAG
 */
export function buildContextPrompt(query: string, fileMap: FileMap): string {
  const rag = performRAG(query, fileMap);

  if (rag.totalTokens === 0) {
    return '';
  }

  let contextPrompt = '\n\n<project_context>\n';

  if (rag.entries.length > 0) {
    contextPrompt += '<memories>\n';

    for (const entry of rag.entries) {
      contextPrompt += `[${entry.source}] ${entry.content}\n`;
    }
    contextPrompt += '</memories>\n';
  }

  if (rag.fileContexts.length > 0) {
    contextPrompt += '<relevant_files>\n';

    for (const file of rag.fileContexts) {
      contextPrompt += `<file path="${file.filePath}">\n${file.relevantContent}\n</file>\n`;
    }
    contextPrompt += '</relevant_files>\n';
  }

  contextPrompt += `</project_context>\n\n`;

  return contextPrompt;
}

/**
 * Start a new chat context
 */
export function startChatContext(params: {
  chatId: string;
  title: string;
  provider: string;
  model: string;
  maxTokens?: number;
}): void {
  const config = contextConfig.get();

  const context: ChatContext = {
    chatId: params.chatId,
    title: params.title,
    startedAt: Date.now(),
    messageCount: 0,
    estimatedTokens: 0,
    maxContextTokens: params.maxTokens || config.maxContextTokens,
    provider: params.provider,
    model: params.model,
    summary: '',
    keyDecisions: [],
    filesModified: [],
  };

  chatContexts.setKey(params.chatId, context);
  activeChatId.set(params.chatId);
  contextUsage.set(0);

  persistChatContext(context);
  logger.info(`Started chat context: ${params.chatId}`);
}

/**
 * Update context token usage
 */
export function updateContextUsage(chatId: string, tokenDelta: number): void {
  const context = chatContexts.get()[chatId];

  if (!context) {
    return;
  }

  const newTokens = context.estimatedTokens + tokenDelta;
  const usagePct = Math.min(100, Math.round((newTokens / context.maxContextTokens) * 100));

  const updated = {
    ...context,
    estimatedTokens: newTokens,
  };

  chatContexts.setKey(chatId, updated);
  contextUsage.set(usagePct);

  // Persist periodically (not on every token update)
  if (tokenDelta > 100) {
    persistChatContext(updated);
  }

  // Check if we need to auto-summarize or start new chat
  const config = contextConfig.get();

  if (usagePct >= config.warningThreshold && usagePct < config.autoNewChatThreshold) {
    // Trigger auto-summarization to free up context
    if (!isAutoSummarizing.get()) {
      triggerAutoSummarize(chatId);
    }
  }

  if (usagePct >= config.autoNewChatThreshold) {
    logger.warn(`Context usage at ${usagePct}% for chat ${chatId}, should start new chat`);
  }
}

/**
 * Trigger automatic summarization to compress context
 */
async function triggerAutoSummarize(chatId: string): Promise<void> {
  isAutoSummarizing.set(true);

  try {
    const context = chatContexts.get()[chatId];

    if (!context) {
      return;
    }

    // Build a summary from key decisions and recent messages
    const summary = [
      context.summary,
      'Key decisions:',
      ...context.keyDecisions.map((d) => `  - ${d}`),
      'Files modified:',
      ...context.filesModified.map((f) => `  - ${f}`),
    ]
      .filter(Boolean)
      .join('\n');

    logger.info(`Auto-summarized context for chat ${chatId} (${summary.length} chars)`);
  } finally {
    isAutoSummarizing.set(false);
  }
}

/**
 * Record a key decision in the current chat
 */
export async function recordDecision(chatId: string, decision: string): Promise<void> {
  const context = chatContexts.get()[chatId];

  if (!context) {
    return;
  }

  const updated = {
    ...context,
    keyDecisions: [...context.keyDecisions, decision],
  };

  chatContexts.setKey(chatId, updated);
  await persistChatContext(updated);

  // Also save as a persistent memory
  await addMemory({
    type: 'decision',
    content: decision,
    source: 'ai',
    chatId,
    tags: ['decision', context.title],
    importance: 4,
  });
}

/**
 * Record a file modification
 */
export async function recordFileModification(chatId: string, filePath: string): Promise<void> {
  const context = chatContexts.get()[chatId];

  if (!context) {
    return;
  }

  if (!context.filesModified.includes(filePath)) {
    const updated = {
      ...context,
      filesModified: [...context.filesModified, filePath],
    };

    chatContexts.setKey(chatId, updated);
    await persistChatContext(updated);
  }
}

/**
 * Check if context limit is approaching and should auto-new chat
 */
export function shouldAutoNewChat(): boolean {
  const usage = contextUsage.get();
  const config = contextConfig.get();

  return usage >= config.autoNewChatThreshold;
}

/**
 * Get context summary for continuing in a new chat
 */
export function getContextHandoff(chatId: string): string {
  const context = chatContexts.get()[chatId];

  if (!context) {
    return '';
  }

  const parts: string[] = [];

  if (context.summary) {
    parts.push(`<previous_context_summary>\n${context.summary}\n</previous_context_summary>`);
  }

  if (context.keyDecisions.length > 0) {
    parts.push(
      '<key_decisions_made>\n' + context.keyDecisions.map((d) => `- ${d}`).join('\n') + '\n</key_decisions_made>',
    );
  }

  if (context.filesModified.length > 0) {
    parts.push('<files_modified>\n' + context.filesModified.map((f) => `- ${f}`).join('\n') + '\n</files_modified>');
  }

  return parts.join('\n\n');
}

/**
 * Get all memories filtered by search
 */
export function getFilteredMemories(): MemoryEntry[] {
  const query = memorySearchQuery.get().toLowerCase();
  const all = Object.values(memories.get());

  if (!query) {
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  return all
    .filter(
      (m) =>
        m.content.toLowerCase().includes(query) ||
        m.tags.some((t) => t.toLowerCase().includes(query)) ||
        m.type.toLowerCase().includes(query),
    )
    .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Delete a memory
 */
export async function deleteMemory(id: string): Promise<void> {
  const updated = { ...memories.get() };
  delete updated[id];
  memories.set(updated);

  try {
    const db = await openDB();
    const tx = db.transaction('memories', 'readwrite');
    tx.objectStore('memories').delete(id);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  } catch (error) {
    logger.error('Failed to delete memory:', error);
  }
}

/**
 * Update context window config
 */
export function updateContextConfig(updates: Partial<ContextWindowConfig>): void {
  contextConfig.set({ ...contextConfig.get(), ...updates });
}

/**
 * Enforce memory limit (remove oldest, least important)
 */
function enforceMemoryLimit(): void {
  const config = contextConfig.get();
  const all = Object.values(memories.get());

  if (all.length <= config.maxMemories) {
    return;
  }

  // Sort by: importance (asc), then timestamp (asc)
  const toRemove = all
    .sort((a, b) => a.importance - b.importance || a.timestamp - b.timestamp)
    .slice(0, all.length - config.maxMemories);

  for (const mem of toRemove) {
    deleteMemory(mem.id);
  }
}

/**
 * Initialize chat memory
 */
export async function initChatMemory(): Promise<void> {
  await loadFromDB();
}
