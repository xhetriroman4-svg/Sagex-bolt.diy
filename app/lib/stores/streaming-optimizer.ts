/**
 * Streaming Response Optimizer
 *
 * Tracks streaming progress, shows incremental file changes,
 * manages parallel file creation, and provides progress visualization.
 */

import { atom, map, type MapStore } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import { formatTokenCount } from './token-tracker';

const logger = createScopedLogger('StreamingOptimizer');

// File streaming progress
export interface FileStreamingProgress {
  fileId: string;
  filePath: string;
  status: 'pending' | 'streaming' | 'complete' | 'failed';
  bytesWritten: number;
  totalBytes: number; // Estimated (can change)
  startedAt: number;
  completedAt?: number;
  error?: string;
}

// Overall streaming session
export interface StreamingSession {
  id: string;
  startedAt: number;
  status: 'idle' | 'streaming' | 'processing' | 'complete' | 'error';
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  parallelActive: number;
  estimatedTotalTokens: number;
  consumedTokens: number;
  messages: string[]; // Status messages
}

// Streaming progress store
export const streamingSession: MapStore<StreamingSession> = map({
  id: '',
  startedAt: 0,
  status: 'idle',
  totalFiles: 0,
  completedFiles: 0,
  failedFiles: 0,
  parallelActive: 0,
  estimatedTotalTokens: 0,
  consumedTokens: 0,
  messages: [],
});

export const fileProgress: MapStore<Record<string, FileStreamingProgress>> = map({});
export const showProgressBar = atom<boolean>(true);
export const streamingSpeed = atom<number>(0); // tokens per second
export const estimatedTimeRemaining = atom<number>(0); // seconds

// Internal tracking
let tokenTimestamps: number[] = [];
let speedCalcInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start a new streaming session
 */
export function startStreamingSession(params: { estimatedTokens?: number } = {}): string {
  const id = `stream-${Date.now()}`;

  streamingSession.set({
    id,
    startedAt: Date.now(),
    status: 'streaming',
    totalFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    parallelActive: 0,
    estimatedTotalTokens: params.estimatedTokens || 0,
    consumedTokens: 0,
    messages: ['Starting AI generation...'],
  });

  fileProgress.set({});
  tokenTimestamps = [];

  // Start speed calculation
  if (speedCalcInterval) {
    clearInterval(speedCalcInterval);
  }

  speedCalcInterval = setInterval(() => {
    calculateStreamingSpeed();
  }, 1000);

  logger.info(`Streaming session started: ${id}`);

  return id;
}

/**
 * End a streaming session
 */
export function endStreamingSession(status: 'complete' | 'error' = 'complete'): void {
  const session = streamingSession.get();

  streamingSession.setKey('status', status);
  streamingSession.setKey('messages', [
    ...session.messages,
    status === 'complete' ? 'Generation complete!' : 'Generation failed.',
  ]);

  if (speedCalcInterval) {
    clearInterval(speedCalcInterval);
    speedCalcInterval = null;
  }

  tokenTimestamps = [];
  streamingSpeed.set(0);
  estimatedTimeRemaining.set(0);

  logger.info(`Streaming session ended: ${session.id} (${status})`);
}

/**
 * Register a file being created/updated
 */
export function registerFileProgress(fileId: string, filePath: string): void {
  const progress = fileProgress.get();

  fileProgress.setKey(fileId, {
    fileId,
    filePath,
    status: 'pending',
    bytesWritten: 0,
    totalBytes: 0,
    startedAt: Date.now(),
  });

  const session = streamingSession.get();
  streamingSession.setKey('totalFiles', session.totalFiles + 1);

  addStreamingMessage(`Creating file: ${filePath}`);

  logger.debug(`File registered: ${filePath}`);
}

/**
 * Update file streaming progress
 */
export function updateFileProgress(
  fileId: string,
  updates: Partial<Pick<FileStreamingProgress, 'status' | 'bytesWritten' | 'totalBytes' | 'error'>>
): void {
  const progress = fileProgress.get();
  const existing = progress[fileId];

  if (!existing) return;

  const updated = { ...existing, ...updates };
  fileProgress.setKey(fileId, updated);

  const session = streamingSession.get();

  // Track completed/failed files
  if (updates.status === 'complete' && existing.status !== 'complete') {
    streamingSession.setKey('completedFiles', session.completedFiles + 1);
    addStreamingMessage(`Completed: ${existing.filePath}`);
  } else if (updates.status === 'failed' && existing.status !== 'failed') {
    streamingSession.setKey('failedFiles', session.failedFiles + 1);
    addStreamingMessage(`Failed: ${existing.filePath} - ${updates.error || 'Unknown error'}`);
  } else if (updates.status === 'streaming' && existing.status !== 'streaming') {
    streamingSession.setKey('parallelActive', session.parallelActive + 1);
  }
}

/**
 * Record token consumption during streaming
 */
export function recordStreamingTokens(tokenCount: number): void {
  const session = streamingSession.get();

  streamingSession.setKey('consumedTokens', session.consumedTokens + tokenCount);

  // Track timestamps for speed calculation
  const now = Date.now();
  tokenTimestamps.push(...Array(tokenCount).fill(now));

  // Keep only last 60 seconds of timestamps
  const cutoff = now - 60000;
  tokenTimestamps = tokenTimestamps.filter((t) => t >= cutoff);

  // Calculate estimated time remaining
  if (session.estimatedTotalTokens > 0) {
    const remaining = session.estimatedTotalTokens - session.consumedTokens - tokenCount;
    const currentSpeed = streamingSpeed.get();

    if (currentSpeed > 0) {
      estimatedTimeRemaining.set(Math.round(remaining / currentSpeed));
    }
  }
}

/**
 * Calculate streaming speed (tokens per second)
 */
function calculateStreamingSpeed(): void {
  const now = Date.now();
  const windowSize = 10000; // 10 second window

  // Count tokens in the last window
  const recentTokens = tokenTimestamps.filter((t) => t >= now - windowSize).length;
  const speed = Math.round(recentTokens / (windowSize / 1000));

  streamingSpeed.set(speed);
}

/**
 * Add a streaming status message
 */
function addStreamingMessage(message: string): void {
  const session = streamingSession.get();

  // Keep only last 50 messages
  const messages = [...session.messages, message].slice(-50);
  streamingSession.setKey('messages', messages);
}

/**
 * Get overall progress percentage
 */
export function getProgressPercentage(): number {
  const session = streamingSession.get();

  if (session.totalFiles === 0) return 0;

  const fileProgress_pct = (session.completedFiles / session.totalFiles) * 100;

  if (session.estimatedTotalTokens > 0) {
    const tokenProgress = (session.consumedTokens / session.estimatedTotalTokens) * 100;
    return Math.min(100, Math.round((fileProgress_pct * 0.4 + tokenProgress * 0.6)));
  }

  return Math.round(fileProgress_pct);
}

/**
 * Get active (streaming) files
 */
export function getActiveFiles(): FileStreamingProgress[] {
  const progress = fileProgress.get();
  return Object.values(progress).filter((f) => f.status === 'streaming');
}

/**
 * Get completed files
 */
export function getCompletedFiles(): FileStreamingProgress[] {
  const progress = fileProgress.get();
  return Object.values(progress).filter((f) => f.status === 'complete');
}

/**
 * Get failed files
 */
export function getFailedFiles(): FileStreamingProgress[] {
  const progress = fileProgress.get();
  return Object.values(progress).filter((f) => f.status === 'failed');
}

/**
 * Format progress for display
 */
export function formatProgress(): string {
  const pct = getProgressPercentage();
  const speed = streamingSpeed.get();
  const eta = estimatedTimeRemaining.get();
  const session = streamingSession.get();

  let text = `${pct}%`;

  if (session.status === 'streaming' && speed > 0) {
    text += ` • ${formatTokenCount(speed)} tokens/s`;

    if (eta > 0) {
      const minutes = Math.floor(eta / 60);
      const seconds = eta % 60;
      text += ` • ~${minutes > 0 ? `${minutes}m ` : ''}${seconds}s remaining`;
    }
  }

  return text;
}

/**
 * Reset streaming state
 */
export function resetStreamingState(): void {
  streamingSession.set({
    id: '',
    startedAt: 0,
    status: 'idle',
    totalFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    parallelActive: 0,
    estimatedTotalTokens: 0,
    consumedTokens: 0,
    messages: [],
  });
  fileProgress.set({});
  streamingSpeed.set(0);
  estimatedTimeRemaining.set(0);
  tokenTimestamps = [];

  if (speedCalcInterval) {
    clearInterval(speedCalcInterval);
    speedCalcInterval = null;
  }
}
