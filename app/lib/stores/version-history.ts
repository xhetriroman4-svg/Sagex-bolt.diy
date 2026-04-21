/**
 * Version History / Time Travel
 *
 * Manages snapshots of the entire WebContainer file system state,
 * provides timeline navigation, and supports branch/merge operations.
 * Snapshots are stored in IndexedDB for persistence across sessions.
 */

import { atom, map, type MapStore } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import type { FileMap } from './files';

const logger = createScopedLogger('VersionHistory');

// Snapshot of the entire file system at a point in time
export interface VersionSnapshot {
  id: string;
  name: string;
  description: string;
  timestamp: number;
  fileMap: FileMap; // Complete file state at this point
  parentId: string | null; // Parent snapshot for branching
  branchName: string;
  tags: string[];
  chatMessageId?: string; // Associated chat message
  tokenCount?: number; // Token usage at this point
}

// Timeline entry for UI display
export interface TimelineEntry {
  id: string;
  name: string;
  description: string;
  timestamp: number;
  branchName: string;
  tags: string[];
}

// Branch info
export interface Branch {
  name: string;
  headSnapshotId: string;
  createdAt: number;
  parentId: string | null;
}

// Version history state
export const snapshots: MapStore<Record<string, VersionSnapshot>> = map({});
export const branches: MapStore<Record<string, Branch>> = map({});
export const currentBranch = atom<string>('main');
export const currentSnapshotId = atom<string | null>(null);
export const isTimeTraveling = atom<boolean>(false);
export const timelineEntries = atom<TimelineEntry[]>([]);

// Auto-save settings
export const autoSaveEnabled = atom<boolean>(true);
export const autoSaveInterval = atom<number>(60000); // 1 minute
export const maxSnapshots = atom<number>(50); // Max snapshots to keep

let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

// IndexedDB for persistence
const DB_NAME = 'sagex-version-history';
const DB_VERSION = 1;
const SNAPSHOTS_STORE = 'snapshots';
const BRANCHES_STORE = 'branches';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        db.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(BRANCHES_STORE)) {
        db.createObjectStore(BRANCHES_STORE, { keyPath: 'name' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save snapshot to IndexedDB
async function persistSnapshot(snapshot: VersionSnapshot): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(SNAPSHOTS_STORE, 'readwrite');
    tx.objectStore(SNAPSHOTS_STORE).put(snapshot);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    logger.error('Failed to persist snapshot:', error);
  }
}

// Save branch to IndexedDB
async function persistBranch(branch: Branch): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(BRANCHES_STORE, 'readwrite');
    tx.objectStore(BRANCHES_STORE).put(branch);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    logger.error('Failed to persist branch:', error);
  }
}

// Load all snapshots from IndexedDB
export async function loadSnapshotsFromDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(SNAPSHOTS_STORE, 'readonly');
    const store = tx.objectStore(SNAPSHOTS_STORE);
    const request = store.getAll();

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const allSnapshots: Record<string, VersionSnapshot> = {};

        for (const snapshot of request.result as VersionSnapshot[]) {
          allSnapshots[snapshot.id] = snapshot;
        }
        snapshots.set(allSnapshots);
        updateTimeline();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
  } catch (error) {
    logger.error('Failed to load snapshots from DB:', error);
  }
}

// Load all branches from IndexedDB
export async function loadBranchesFromDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(BRANCHES_STORE, 'readonly');
    const store = tx.objectStore(BRANCHES_STORE);
    const request = store.getAll();

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const allBranches: Record<string, Branch> = {};

        for (const branch of request.result as Branch[]) {
          allBranches[branch.name] = branch;
        }
        branches.set(allBranches);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
  } catch (error) {
    logger.error('Failed to load branches from DB:', error);
  }
}

// Update timeline entries for UI
function updateTimeline(): void {
  const allSnapshots = snapshots.get();
  const entries: TimelineEntry[] = Object.values(allSnapshots)
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      timestamp: s.timestamp,
      branchName: s.branchName,
      tags: s.tags,
    }));

  timelineEntries.set(entries);
}

// Create a snapshot of the current file state
export function createSnapshot(params: {
  name?: string;
  description?: string;
  tags?: string[];
  chatMessageId?: string;
  tokenCount?: number;
}): string {
  const id = `snap-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const branch = currentBranch.get();
  const existingSnapshots = snapshots.get();
  const existingBranches = branches.get();
  const parentBranch = existingBranches[branch];

  const parentId = parentBranch?.headSnapshotId || null;

  const snapshot: VersionSnapshot = {
    id,
    name: params.name || `Snapshot ${Object.keys(existingSnapshots).length + 1}`,
    description: params.description || '',
    timestamp: Date.now(),
    fileMap: {}, // Will be filled by the caller with actual file state
    parentId,
    branchName: branch,
    tags: params.tags || [],
    chatMessageId: params.chatMessageId,
    tokenCount: params.tokenCount,
  };

  // Update store
  snapshots.setKey(id, snapshot);

  // Update branch head
  if (parentBranch) {
    branches.setKey(branch, { ...parentBranch, headSnapshotId: id });
  } else {
    branches.setKey(branch, {
      name: branch,
      headSnapshotId: id,
      createdAt: Date.now(),
      parentId,
    });
  }

  updateTimeline();

  // Persist to IndexedDB
  persistSnapshot(snapshot);
  persistBranch(branches.get()[branch]);

  logger.info(`Created snapshot: ${id} - ${snapshot.name}`);

  return id;
}

// Create a snapshot with actual file data (called from workbench)
export async function createSnapshotWithFiles(
  fileMap: FileMap,
  params: {
    name?: string;
    description?: string;
    tags?: string[];
    chatMessageId?: string;
    tokenCount?: number;
  },
): Promise<string> {
  const id = createSnapshot(params);
  const snapshot = snapshots.get()[id];

  if (snapshot) {
    // Deep clone the file map to capture state at this point
    const clonedFileMap: FileMap = {};

    for (const [path, dirent] of Object.entries(fileMap)) {
      if (dirent) {
        clonedFileMap[path] = { ...dirent };
      }
    }

    snapshot.fileMap = clonedFileMap;
    snapshots.setKey(id, snapshot);
    persistSnapshot(snapshot);
  }

  return id;
}

// Restore a snapshot (time travel)
export function restoreSnapshot(snapshotId: string): VersionSnapshot | null {
  const snapshot = snapshots.get()[snapshotId];

  if (!snapshot) {
    logger.error(`Snapshot not found: ${snapshotId}`);
    return null;
  }

  currentSnapshotId.set(snapshotId);
  isTimeTraveling.set(true);

  logger.info(`Restored snapshot: ${snapshotId} - ${snapshot.name}`);

  return snapshot;
}

// Exit time travel mode (return to latest state)
export function exitTimeTravel(): void {
  currentSnapshotId.set(null);
  isTimeTraveling.set(false);
  logger.info('Exited time travel mode');
}

// Create a new branch from current or specific snapshot
export function createBranch(name: string, fromSnapshotId?: string): Branch | null {
  const existingBranches = branches.get();

  if (existingBranches[name]) {
    logger.error(`Branch already exists: ${name}`);
    return null;
  }

  const targetSnapshotId =
    fromSnapshotId || currentSnapshotId.get() || existingBranches[currentBranch.get()]?.headSnapshotId;

  if (!targetSnapshotId) {
    logger.error('No snapshot to branch from');
    return null;
  }

  const branch: Branch = {
    name,
    headSnapshotId: targetSnapshotId,
    createdAt: Date.now(),
    parentId: targetSnapshotId,
  };

  branches.setKey(name, branch);
  persistBranch(branch);

  logger.info(`Created branch: ${name} from snapshot ${targetSnapshotId}`);

  return branch;
}

// Switch to a branch
export function switchBranch(name: string): boolean {
  const existingBranches = branches.get();
  const branch = existingBranches[name];

  if (!branch) {
    logger.error(`Branch not found: ${name}`);
    return false;
  }

  currentBranch.set(name);
  exitTimeTravel();

  logger.info(`Switched to branch: ${name}`);

  return true;
}

// Merge a branch into current branch
export function mergeBranch(sourceBranchName: string): VersionSnapshot | null {
  const existingBranches = branches.get();
  const sourceBranch = existingBranches[sourceBranchName];
  const targetBranch = existingBranches[currentBranch.get()];

  if (!sourceBranch || !targetBranch) {
    logger.error('Source or target branch not found');
    return null;
  }

  const sourceSnapshot = snapshots.get()[sourceBranch.headSnapshotId];

  if (!sourceSnapshot) {
    logger.error(`Source snapshot not found: ${sourceBranch.headSnapshotId}`);
    return null;
  }

  // Create a merge snapshot
  const mergeId = createSnapshot({
    name: `Merge ${sourceBranchName} → ${currentBranch.get()}`,
    description: `Merged branch '${sourceBranchName}' into '${currentBranch.get()}'`,
    tags: ['merge'],
  });

  const mergeSnapshot = snapshots.get()[mergeId];

  if (mergeSnapshot) {
    // Use source branch files as the merged state
    mergeSnapshot.fileMap = { ...sourceSnapshot.fileMap };
    snapshots.setKey(mergeId, mergeSnapshot);
    persistSnapshot(mergeSnapshot);
  }

  logger.info(`Merged branch ${sourceBranchName} into ${currentBranch.get()}`);

  return mergeSnapshot || null;
}

// Delete a branch
export function deleteBranch(name: string): boolean {
  if (name === 'main') {
    logger.error('Cannot delete main branch');
    return false;
  }

  const existingBranches = branches.get();

  if (!existingBranches[name]) {
    return false;
  }

  // Delete branch
  const updated = { ...existingBranches };
  delete updated[name];
  branches.set(updated);

  // Delete associated snapshots from this branch
  const existingSnapshots = snapshots.get();
  const updatedSnapshots = { ...existingSnapshots };

  for (const [id, snapshot] of Object.entries(updatedSnapshots)) {
    if (snapshot.branchName === name) {
      delete updatedSnapshots[id];
    }
  }

  snapshots.set(updatedSnapshots);

  logger.info(`Deleted branch: ${name}`);

  return true;
}

// Delete a snapshot
export function deleteSnapshot(id: string): boolean {
  const existingSnapshots = snapshots.get();
  const snapshot = existingSnapshots[id];

  if (!snapshot) {
    return false;
  }

  // Don't delete if it's a branch head
  const existingBranches = branches.get();

  for (const branch of Object.values(existingBranches)) {
    if (branch.headSnapshotId === id) {
      logger.error('Cannot delete snapshot that is a branch head');
      return false;
    }
  }

  const updated = { ...existingSnapshots };
  delete updated[id];
  snapshots.set(updated);
  updateTimeline();

  logger.info(`Deleted snapshot: ${id}`);

  return true;
}

// Get snapshot by ID
export function getSnapshot(id: string): VersionSnapshot | undefined {
  return snapshots.get()[id];
}

// Get all snapshots for a branch
export function getBranchSnapshots(branchName: string): VersionSnapshot[] {
  const allSnapshots = snapshots.get();
  return Object.values(allSnapshots)
    .filter((s) => s.branchName === branchName)
    .sort((a, b) => a.timestamp - b.timestamp);
}

// Get current branch info
export function getCurrentBranch(): Branch | undefined {
  return branches.get()[currentBranch.get()];
}

// Get diff between two snapshots
export function getSnapshotDiff(
  snapshotId1: string,
  snapshotId2: string,
): {
  added: string[];
  modified: string[];
  deleted: string[];
} {
  const snap1 = snapshots.get()[snapshotId1];
  const snap2 = snapshots.get()[snapshotId2];

  if (!snap1 || !snap2) {
    return { added: [], modified: [], deleted: [] };
  }

  const files1 = new Set(Object.keys(snap1.fileMap));
  const files2 = new Set(Object.keys(snap2.fileMap));

  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const path of files2) {
    if (!files1.has(path)) {
      added.push(path);
    } else {
      const f1 = snap1.fileMap[path];
      const f2 = snap2.fileMap[path];

      if (f1 && f2 && f1.type === 'file' && f2.type === 'file' && f1.content !== f2.content) {
        modified.push(path);
      }
    }
  }

  for (const path of files1) {
    if (!files2.has(path)) {
      deleted.push(path);
    }
  }

  return { added, modified, deleted };
}

// Auto-save snapshot (called periodically)
export function startAutoSave(getCurrentFileMap: () => FileMap): void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
  }

  const interval = autoSaveInterval.get();

  autoSaveTimer = setInterval(async () => {
    if (!autoSaveEnabled.get()) {
      return;
    }

    const fileMap = getCurrentFileMap();

    if (Object.keys(fileMap).length === 0) {
      return; // Don't save empty state
    }

    // Check if there are changes since last snapshot
    const branch = getCurrentBranch();

    if (branch) {
      const lastSnapshot = snapshots.get()[branch.headSnapshotId];

      if (lastSnapshot) {
        const hasChanges = Object.keys(fileMap).some((path) => {
          const current = fileMap[path];
          const previous = lastSnapshot.fileMap[path];

          return (
            !current !== !previous ||
            (current &&
              previous &&
              current.type === 'file' &&
              previous.type === 'file' &&
              current.content !== previous.content)
          );
        });

        if (!hasChanges) {
          return; // No changes, skip auto-save
        }
      }
    }

    await createSnapshotWithFiles(fileMap, {
      name: `Auto-save ${new Date().toLocaleTimeString()}`,
      description: 'Automatic snapshot',
      tags: ['auto-save'],
    });

    // Enforce max snapshots limit
    enforceMaxSnapshots();
  }, interval);
}

export function stopAutoSave(): void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

// Enforce max snapshots limit (delete oldest)
function enforceMaxSnapshots(): void {
  const limit = maxSnapshots.get();
  const allSnapshots = snapshots.get();
  const snapshotList = Object.values(allSnapshots).sort((a, b) => a.timestamp - b.timestamp);

  if (snapshotList.length <= limit) {
    return;
  }

  const toDelete = snapshotList.slice(0, snapshotList.length - limit);
  const branchHeads = new Set(Object.values(branches.get()).map((b) => b.headSnapshotId));

  for (const snapshot of toDelete) {
    if (!branchHeads.has(snapshot.id)) {
      deleteSnapshot(snapshot.id);
    }
  }
}

// Initialize default main branch if needed
export async function initVersionHistory(): Promise<void> {
  await loadSnapshotsFromDB();
  await loadBranchesFromDB();

  const existingBranches = branches.get();

  if (!existingBranches.main) {
    branches.setKey('main', {
      name: 'main',
      headSnapshotId: '',
      createdAt: Date.now(),
      parentId: null,
    });
  }

  updateTimeline();
}

// Rename a snapshot
export function renameSnapshot(id: string, newName: string): boolean {
  const snapshot = snapshots.get()[id];

  if (!snapshot) {
    return false;
  }

  const updated = { ...snapshot, name: newName };
  snapshots.setKey(id, updated);
  persistSnapshot(updated);
  updateTimeline();

  return true;
}

// Add tag to snapshot
export function addTag(snapshotId: string, tag: string): boolean {
  const snapshot = snapshots.get()[snapshotId];

  if (!snapshot || snapshot.tags.includes(tag)) {
    return false;
  }

  const updated = { ...snapshot, tags: [...snapshot.tags, tag] };
  snapshots.setKey(snapshotId, updated);
  persistSnapshot(updated);
  updateTimeline();

  return true;
}

// Remove tag from snapshot
export function removeTag(snapshotId: string, tag: string): boolean {
  const snapshot = snapshots.get()[snapshotId];

  if (!snapshot) {
    return false;
  }

  const updated = { ...snapshot, tags: snapshot.tags.filter((t) => t !== tag) };
  snapshots.setKey(snapshotId, updated);
  persistSnapshot(updated);
  updateTimeline();

  return true;
}

// Get file content at a specific snapshot
export function getFileAtSnapshot(snapshotId: string, filePath: string): string | null {
  const snapshot = snapshots.get()[snapshotId];

  if (!snapshot) {
    return null;
  }

  const file = snapshot.fileMap[filePath];

  if (!file || file.type !== 'file') {
    return null;
  }

  return file.content;
}
