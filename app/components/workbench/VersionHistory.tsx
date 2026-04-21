import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch,
  GitCommit,
  Clock,
  Tag,
  Plus,
  RotateCcw,
  Trash2,
  ChevronRight,
  ChevronDown,
  GitMerge,
  Play,
  Copy,
  Check,
} from 'lucide-react';
import { useState, useCallback } from 'react';
import {
  timelineEntries,
  currentBranch,
  isTimeTraveling,
  currentSnapshotId,
  snapshots,
  branches,
  createBranch,
  switchBranch,
  restoreSnapshot,
  exitTimeTravel,
  deleteSnapshot,
  removeTag,
  getSnapshotDiff,
} from '~/lib/stores/version-history';

export default function VersionHistory() {
  const $timeline = useStore(timelineEntries);
  const $currentBranch = useStore(currentBranch);
  const $isTimeTraveling = useStore(isTimeTraveling);
  const $currentSnapshotId = useStore(currentSnapshotId);
  const $snapshots = useStore(snapshots);
  const $branches = useStore(branches);

  const [expandedSnapshot, setExpandedSnapshot] = useState<string | null>(null);
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showDiff, setShowDiff] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleRestore = useCallback((snapshotId: string) => {
    restoreSnapshot(snapshotId);
  }, []);

  const handleExitTimeTravel = useCallback(() => {
    exitTimeTravel();
  }, []);

  const handleCreateBranch = useCallback(() => {
    if (newBranchName.trim()) {
      createBranch(newBranchName.trim(), $currentSnapshotId || undefined);
      setNewBranchName('');
      setShowNewBranch(false);
    }
  }, [newBranchName, $currentSnapshotId]);

  const handleDeleteSnapshot = useCallback((snapshotId: string) => {
    deleteSnapshot(snapshotId);
    setExpandedSnapshot(null);
  }, []);

  const handleCopySnapshotId = useCallback((id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const getDiff = useCallback(
    (snapshotId: string) => {
      const snap = $snapshots[snapshotId];

      if (!snap?.parentId) {
        return null;
      }

      return getSnapshotDiff(snap.parentId, snapshotId);
    },
    [$snapshots],
  );

  const branchList = Object.values($branches);

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold">Version History</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowNewBranch(!showNewBranch)}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            title="New Branch"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <select
            value={$currentBranch}
            onChange={(e) => switchBranch(e.target.value)}
            className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white outline-none"
          >
            {branchList.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* New Branch Input */}
      <AnimatePresence>
        {showNewBranch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-white/10 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-2">
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
                placeholder="Branch name..."
                className="flex-1 text-xs bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white placeholder:text-white/30 outline-none focus:border-blue-500"
                autoFocus
              />
              <button
                onClick={handleCreateBranch}
                className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => setShowNewBranch(false)}
                className="text-xs text-white/50 hover:text-white px-2 py-1.5"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Time Travel Banner */}
      <AnimatePresence>
        {$isTimeTraveling && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-yellow-500/30 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2 bg-yellow-500/10">
              <div className="flex items-center gap-2 text-yellow-400">
                <Clock className="w-3.5 h-3.5 animate-pulse" />
                <span className="text-xs font-medium">Time Travel Mode - Viewing: {$currentSnapshotId}</span>
              </div>
              <button
                onClick={handleExitTimeTravel}
                className="flex items-center gap-1 text-xs bg-yellow-600 hover:bg-yellow-500 px-2 py-1 rounded transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Return to Present
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[9px] top-0 bottom-0 w-px bg-white/10" />

          <AnimatePresence>
            {$timeline.map((entry, index) => {
              const isExpanded = expandedSnapshot === entry.id;
              const isCurrent = entry.id === $currentSnapshotId;
              const snapshot = $snapshots[entry.id];
              const diff = showDiff === entry.id ? getDiff(entry.id) : null;

              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: index * 0.03 }}
                  className="relative pl-8 pb-3"
                >
                  {/* Timeline dot */}
                  <div
                    className={`absolute left-0 top-1.5 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center z-10 ${
                      isCurrent ? 'border-yellow-400 bg-yellow-400/20' : 'border-white/20 bg-[#0a0a0f]'
                    }`}
                  >
                    {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                  </div>

                  {/* Entry Content */}
                  <button
                    onClick={() => setExpandedSnapshot(isExpanded ? null : entry.id)}
                    className={`w-full text-left rounded-lg p-2 transition-colors ${
                      isCurrent ? 'bg-yellow-500/10 border border-yellow-500/30' : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium truncate">{entry.name}</span>
                        {entry.tags.length > 0 && (
                          <div className="flex gap-1">
                            {entry.tags.slice(0, 2).map((tag) => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                                {tag}
                              </span>
                            ))}
                            {entry.tags.length > 2 && (
                              <span className="text-[10px] text-white/30">+{entry.tags.length - 2}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-white/30">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 text-white/30" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-white/30" />
                        )}
                      </div>
                    </div>
                    {entry.description && (
                      <p className="text-[11px] text-white/40 mt-0.5 truncate">{entry.description}</p>
                    )}
                  </button>

                  {/* Expanded Details */}
                  <AnimatePresence>
                    {isExpanded && snapshot && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden ml-2"
                      >
                        <div className="mt-1 p-2 rounded-lg bg-white/5 border border-white/10 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-white/40 font-mono">{entry.id}</span>
                            <button
                              onClick={() => handleCopySnapshotId(entry.id)}
                              className="text-white/30 hover:text-white/60"
                            >
                              {copiedId === entry.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            <button
                              onClick={() => handleRestore(entry.id)}
                              className="flex items-center gap-1 text-[11px] bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 px-2 py-1 rounded transition-colors"
                            >
                              <Play className="w-3 h-3" /> Restore
                            </button>
                            <button
                              onClick={() => setShowDiff(showDiff === entry.id ? null : entry.id)}
                              className="flex items-center gap-1 text-[11px] bg-white/5 hover:bg-white/10 text-white/60 px-2 py-1 rounded transition-colors"
                            >
                              <GitMerge className="w-3 h-3" /> Diff
                            </button>
                            <button
                              onClick={() => handleDeleteSnapshot(entry.id)}
                              className="flex items-center gap-1 text-[11px] bg-red-600/20 hover:bg-red-600/30 text-red-400 px-2 py-1 rounded transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          {/* Diff View */}
                          {diff && (
                            <div className="text-[10px] font-mono space-y-1 p-2 rounded bg-black/30">
                              {diff.added.length > 0 && (
                                <div className="text-green-400">
                                  <span className="font-bold">+ Added ({diff.added.length}):</span>
                                  <div className="pl-2">
                                    {diff.added.slice(0, 5).join(', ')}
                                    {diff.added.length > 5 ? '...' : ''}
                                  </div>
                                </div>
                              )}
                              {diff.modified.length > 0 && (
                                <div className="text-yellow-400">
                                  <span className="font-bold">~ Modified ({diff.modified.length}):</span>
                                  <div className="pl-2">
                                    {diff.modified.slice(0, 5).join(', ')}
                                    {diff.modified.length > 5 ? '...' : ''}
                                  </div>
                                </div>
                              )}
                              {diff.deleted.length > 0 && (
                                <div className="text-red-400">
                                  <span className="font-bold">- Deleted ({diff.deleted.length}):</span>
                                  <div className="pl-2">
                                    {diff.deleted.slice(0, 5).join(', ')}
                                    {diff.deleted.length > 5 ? '...' : ''}
                                  </div>
                                </div>
                              )}
                              {diff.added.length === 0 && diff.modified.length === 0 && diff.deleted.length === 0 && (
                                <span className="text-white/30">No changes</span>
                              )}
                            </div>
                          )}
                          {entry.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {entry.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50"
                                >
                                  <Tag className="w-2.5 h-2.5" /> {tag}
                                  <button onClick={() => removeTag(entry.id, tag)} className="hover:text-red-400">
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {$timeline.length === 0 && (
            <div className="text-center py-8 text-white/30 text-xs">
              <GitCommit className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No snapshots yet</p>
              <p className="mt-1">Snapshots are created automatically as you work</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-2 border-t border-white/10 text-[10px] text-white/30 flex justify-between">
        <span>{Object.keys($snapshots).length} snapshots</span>
        <span>{Object.keys($branches).length} branches</span>
        <span>Current: {$currentBranch}</span>
      </div>
    </div>
  );
}
