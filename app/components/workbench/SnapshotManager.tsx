import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Save, Download, Upload, Share2, Copy, Trash2, GitFork, Search,
  Filter, ExternalLink, Clock, FileCode, Check, Tag, X
} from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import {
  sandboxSnapshots, selectedSnapshotId, snapshotSearchQuery, snapshotFilterTag,
  saveSnapshot, loadSnapshot, forkSnapshot, deleteSnapshot,
  generateShareLink, exportSnapshot, importSnapshot, exportSnapshotAsZip,
  getFilteredSnapshots, updateSnapshotMeta
} from '~/lib/stores/snapshots';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';
import type { SandboxSnapshot } from '~/lib/stores/snapshots';
import fileSaver from 'file-saver';

const logger = createScopedLogger('SnapshotManager');
const { saveAs } = fileSaver;

export default function SnapshotManager() {
  const $snapshots = useStore(sandboxSnapshots);
  const $selectedId = useStore(selectedSnapshotId);
  const $searchQuery = useStore(snapshotSearchQuery);
  const $filterTag = useStore(snapshotFilterTag);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveTags, setSaveTags] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = getFilteredSnapshots();
  const allTags = [...new Set(Object.values($snapshots).flatMap((s) => s.tags))];

  const handleSave = useCallback(async () => {
    try {
      const fileMap = workbenchStore.files.get();
      await saveSnapshot({
        name: saveName || undefined,
        description: saveDescription || undefined,
        fileMap,
        tags: saveTags ? saveTags.split(',').map((t) => t.trim()) : undefined,
      });
      setShowSaveDialog(false);
      setSaveName('');
      setSaveDescription('');
      setSaveTags('');
    } catch (error) {
      logger.error('Failed to save snapshot:', error);
    }
  }, [saveName, saveDescription, saveTags]);

  const handleLoad = useCallback((snapshotId: string) => {
    const files = loadSnapshot(snapshotId);
    if (files) {
      workbenchStore.setDocuments(files);
      logger.info('Snapshot loaded');
    }
  }, []);

  const handleFork = useCallback(async (snapshotId: string) => {
    await forkSnapshot(snapshotId);
  }, []);

  const handleShare = useCallback((snapshotId: string) => {
    const url = generateShareLink(snapshotId);
    if (url) {
      setShareUrl(url);
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleDelete = useCallback(async (snapshotId: string) => {
    await deleteSnapshot(snapshotId);
  }, []);

  const handleExportJson = useCallback(async (snapshotId: string) => {
    const json = exportSnapshot(snapshotId);
    if (json) {
      const blob = new Blob([json], { type: 'application/json' });
      saveAs(blob, `snapshot-${snapshotId}.json`);
    }
  }, []);

  const handleExportZip = useCallback(async (snapshotId: string) => {
    const blob = await exportSnapshotAsZip(snapshotId);
    if (blob) {
      saveAs(blob, `snapshot-${snapshotId}.zip`);
    }
  }, []);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      if (file.name.endsWith('.json')) {
        await importSnapshot(text);
      }
    } catch (error) {
      logger.error('Failed to import snapshot:', error);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleRename = useCallback((snapshotId: string) => {
    setEditingId(snapshotId);
    const snap = $snapshots[snapshotId];
    setEditName(snap?.name || '');
  }, [$snapshots]);

  const handleSaveRename = useCallback(async (snapshotId: string) => {
    await updateSnapshotMeta(snapshotId, { name: editName });
    setEditingId(null);
  }, [editName]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Save className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold">Snapshots</h3>
          <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
            {Object.keys($snapshots).length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            title="Import Snapshot"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowSaveDialog(true)}
            className="p-1.5 rounded-md bg-purple-600 hover:bg-purple-500 transition-colors"
            title="Save Current State"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
        <div className="flex-1 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
          <input
            type="text"
            value={$searchQuery}
            onChange={(e) => snapshotSearchQuery.set(e.target.value)}
            placeholder="Search snapshots..."
            className="w-full text-xs bg-white/5 border border-white/10 rounded pl-7 pr-2 py-1.5 text-white placeholder:text-white/30 outline-none focus:border-purple-500"
          />
        </div>
        <select
          value={$filterTag}
          onChange={(e) => snapshotFilterTag.set(e.target.value)}
          className="text-[11px] bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white outline-none"
        >
          <option value="">All Tags</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
      </div>

      {/* Save Dialog */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-white/10 overflow-hidden"
          >
            <div className="p-4 space-y-2 bg-purple-500/5">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Snapshot name..."
                className="w-full text-xs bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder:text-white/30 outline-none focus:border-purple-500"
                autoFocus
              />
              <input
                type="text"
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="Description (optional)..."
                className="w-full text-xs bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder:text-white/30 outline-none"
              />
              <input
                type="text"
                value={saveTags}
                onChange={(e) => setSaveTags(e.target.value)}
                placeholder="Tags (comma separated)..."
                className="w-full text-xs bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder:text-white/30 outline-none"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowSaveDialog(false)} className="text-xs text-white/50 hover:text-white px-3 py-1.5">
                  Cancel
                </button>
                <button onClick={handleSave} className="text-xs bg-purple-600 hover:bg-purple-500 px-3 py-1.5 rounded transition-colors">
                  Save Snapshot
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share URL Banner */}
      <AnimatePresence>
        {shareUrl && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-green-500/30 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10">
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span className="text-xs text-green-400 flex-1 truncate">{shareUrl}</span>
              <button onClick={() => setShareUrl(null)} className="text-white/30 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Snapshot List */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        <AnimatePresence>
          {filtered.map((snapshot) => (
            <motion.div
              key={snapshot.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className={`rounded-lg border transition-colors ${
                $selectedId === snapshot.id ? 'border-purple-500/50 bg-purple-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
              }`}
            >
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {editingId === snapshot.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => handleSaveRename(snapshot.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(snapshot.id); if (e.key === 'Escape') setEditingId(null); }}
                        className="flex-1 text-xs bg-white/10 border border-white/20 rounded px-2 py-1 text-white outline-none"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="text-xs font-medium truncate cursor-pointer"
                        onClick={() => handleRename(snapshot.id)}
                        title="Click to rename"
                      >
                        {snapshot.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => handleLoad(snapshot.id)} className="p-1 rounded hover:bg-white/10" title="Load">
                      <ExternalLink className="w-3 h-3 text-blue-400" />
                    </button>
                    <button onClick={() => handleFork(snapshot.id)} className="p-1 rounded hover:bg-white/10" title="Fork">
                      <GitFork className="w-3 h-3 text-green-400" />
                    </button>
                    <button onClick={() => handleShare(snapshot.id)} className="p-1 rounded hover:bg-white/10" title="Share">
                      <Share2 className="w-3 h-3 text-yellow-400" />
                    </button>
                    <button onClick={() => handleExportJson(snapshot.id)} className="p-1 rounded hover:bg-white/10" title="Export JSON">
                      <Download className="w-3 h-3 text-white/40" />
                    </button>
                    <button onClick={() => handleExportZip(snapshot.id)} className="p-1 rounded hover:bg-white/10" title="Export ZIP">
                      <FileCode className="w-3 h-3 text-white/40" />
                    </button>
                    <button onClick={() => handleDelete(snapshot.id)} className="p-1 rounded hover:bg-red-500/10" title="Delete">
                      <Trash2 className="w-3 h-3 text-red-400/60 hover:text-red-400" />
                    </button>
                  </div>
                </div>

                {snapshot.description && (
                  <p className="text-[11px] text-white/40 mt-1 truncate">{snapshot.description}</p>
                )}

                <div className="flex items-center gap-3 mt-2 text-[10px] text-white/30">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(snapshot.createdAt).toLocaleDateString()} {new Date(snapshot.createdAt).toLocaleTimeString()}
                  </span>
                  <span>{snapshot.totalFiles} files</span>
                  <span>{formatSize(snapshot.totalSize)}</span>
                  {snapshot.shareCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Share2 className="w-3 h-3" /> {snapshot.shareCount}
                    </span>
                  )}
                  {snapshot.forkedFrom && (
                    <span className="text-purple-400">forked</span>
                  )}
                </div>

                {snapshot.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {snapshot.tags.map((tag) => (
                      <span key={tag} className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">
                        <Tag className="w-2 h-2" /> {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-white/30 text-xs">
            <Save className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>No snapshots found</p>
            <p className="mt-1">Save your current project state to create a snapshot</p>
          </div>
        )}
      </div>
    </div>
  );
}
