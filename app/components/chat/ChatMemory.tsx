import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Search, Trash2, Tag, Lightbulb, Settings, AlertTriangle,
  Clock, MessageSquare, FileCode, ChevronRight, X, Sparkles, RotateCcw
} from 'lucide-react';
import { useState, useCallback } from 'react';
import {
  memories, contextUsage, showMemoryPanel, memorySearchQuery,
  contextConfig, chatContexts, activeChatId, isAutoSummarizing,
  getFilteredMemories, shouldAutoNewChat, deleteMemory,
  getContextHandoff, updateContextConfig
} from '~/lib/stores/chat-memory';
import { formatTokenCount } from '~/lib/stores/token-tracker';
import { createScopedLogger } from '~/utils/logger';
import type { MemoryEntry } from '~/lib/stores/chat-memory';

const logger = createScopedLogger('ChatMemory');

const TYPE_ICONS: Record<string, typeof Lightbulb> = {
  decision: Lightbulb,
  preference: Settings,
  fact: Sparkles,
  error_fix: AlertTriangle,
  pattern: FileCode,
  context: MessageSquare,
};

const TYPE_COLORS: Record<string, string> = {
  decision: 'text-yellow-400 bg-yellow-400/10',
  preference: 'text-purple-400 bg-purple-400/10',
  fact: 'text-blue-400 bg-blue-400/10',
  error_fix: 'text-red-400 bg-red-400/10',
  pattern: 'text-green-400 bg-green-400/10',
  context: 'text-white/40 bg-white/5',
};

export default function ChatMemory() {
  const $memories = useStore(memories);
  const $usage = useStore(contextUsage);
  const $show = useStore(showMemoryPanel);
  const $search = useStore(memorySearchQuery);
  const $config = useStore(contextConfig);
  const $contexts = useStore(chatContexts);
  const $activeChatId = useStore(activeChatId);
  const $isSummarizing = useStore(isAutoSummarizing);

  const [showSettings, setShowSettings] = useState(false);

  const filtered = getFilteredMemories();
  const shouldNewChat = shouldAutoNewChat();
  const activeContext = $activeChatId ? $contexts[$activeChatId] : null;

  const usageColor = $usage >= 90 ? 'text-red-400' : $usage >= 70 ? 'text-yellow-400' : 'text-green-400';
  const usageBarColor = $usage >= 90 ? 'bg-red-500' : $usage >= 70 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold">Context Memory</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-md transition-colors ${showSettings ? 'bg-white/10' : 'hover:bg-white/10'}`}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Context Usage Bar */}
      <div className="px-4 py-2 border-b border-white/10">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-white/40">Context Window</span>
          <span className={`text-[10px] font-medium ${usageColor}`}>
            {$usage}% • {activeContext ? formatTokenCount(activeContext.estimatedTokens) : 0} tokens
          </span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full transition-all duration-500 ${usageBarColor}`}
            style={{ width: `${$usage}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[9px] text-white/20">
            Max: {formatTokenCount($config.maxContextTokens)}
          </span>
          {shouldNewChat && (
            <span className="flex items-center gap-1 text-[9px] text-red-400 animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              Context nearly full
            </span>
          )}
          {$isSummarizing && (
            <span className="flex items-center gap-1 text-[9px] text-yellow-400">
              <RotateCcw className="w-3 h-3 animate-spin" />
              Summarizing...
            </span>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-white/10 overflow-hidden"
          >
            <div className="p-4 space-y-3 bg-white/[0.02]">
              <div>
                <label className="text-[10px] text-white/40 block mb-1">Max Context Tokens</label>
                <input
                  type="number"
                  value={$config.maxContextTokens}
                  onChange={(e) => updateContextConfig({ maxContextTokens: parseInt(e.target.value) || 128000 })}
                  className="w-full text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 block mb-1">Auto-summarize at (%)</label>
                <input
                  type="range"
                  min="50"
                  max="99"
                  value={$config.warningThreshold}
                  onChange={(e) => updateContextConfig({ warningThreshold: parseInt(e.target.value) })}
                  className="w-full"
                />
                <span className="text-[10px] text-white/30">{$config.warningThreshold}%</span>
              </div>
              <div>
                <label className="text-[10px] text-white/40 block mb-1">Auto-new chat at (%)</label>
                <input
                  type="range"
                  min="80"
                  max="100"
                  value={$config.autoNewChatThreshold}
                  onChange={(e) => updateContextConfig({ autoNewChatThreshold: parseInt(e.target.value) })}
                  className="w-full"
                />
                <span className="text-[10px] text-white/30">{$config.autoNewChatThreshold}%</span>
              </div>
              <div>
                <label className="text-[10px] text-white/40 block mb-1">RAG Top K Results</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={$config.ragTopK}
                  onChange={(e) => updateContextConfig({ ragTopK: parseInt(e.target.value) || 10 })}
                  className="w-full text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="px-4 py-2 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
          <input
            type="text"
            value={$search}
            onChange={(e) => memorySearchQuery.set(e.target.value)}
            placeholder="Search memories..."
            className="w-full text-xs bg-white/5 border border-white/10 rounded pl-7 pr-2 py-1.5 text-white placeholder:text-white/30 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Active Chat Info */}
      {activeContext && (
        <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02]">
          <div className="text-[10px] text-white/30 space-y-0.5">
            <div className="flex justify-between">
              <span>Chat: {activeContext.title || activeContext.chatId.substring(0, 8)}</span>
              <span>{activeContext.messageCount} messages</span>
            </div>
            <div className="flex justify-between">
              <span>{activeContext.keyDecisions.length} decisions</span>
              <span>{activeContext.filesModified.length} files modified</span>
            </div>
          </div>
        </div>
      )}

      {/* Memory List */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
        <AnimatePresence>
          {filtered.map((memory) => {
            const Icon = TYPE_ICONS[memory.type] || Sparkles;
            const colorClass = TYPE_COLORS[memory.type] || TYPE_COLORS.context;

            return (
              <motion.div
                key={memory.id}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 5 }}
                className="rounded-lg p-2.5 bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors group"
              >
                <div className="flex items-start gap-2">
                  <div className={`shrink-0 p-1 rounded ${colorClass.split(' ')[1] || 'bg-white/5'}`}>
                    <Icon className={`w-3 h-3 ${colorClass.split(' ')[0]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-white/70 leading-relaxed">{memory.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-white/20 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(memory.timestamp).toLocaleDateString()}
                      </span>
                      <span className="text-[9px] text-white/20">{memory.source}</span>
                      {memory.tags.length > 0 && (
                        <div className="flex gap-0.5">
                          {memory.tags.slice(0, 2).map((tag) => (
                            <span key={tag} className="text-[8px] px-1 py-0.5 rounded bg-white/5 text-white/25">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMemory(memory.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 rounded transition-all"
                  >
                    <Trash2 className="w-3 h-3 text-red-400/50" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-white/20 text-xs">
            <Brain className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>No memories stored yet</p>
            <p className="mt-1">Memories are created as you interact with AI</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-white/10 text-[10px] text-white/20 flex justify-between">
        <span>{Object.keys($memories).length} memories</span>
        <span>Context: {$usage}%</span>
      </div>
    </div>
  );
}
