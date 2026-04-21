/**
 * Code Sandbox Snapshots
 *
 * Manages save/load/share of entire project states.
 * Supports sharing via URL (encoded), forking, and export.
 */

import { atom, map, type MapStore } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import type { FileMap } from './files';
import JSZip from 'jszip';

const logger = createScopedLogger('Snapshots');

export interface SandboxSnapshot {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  files: FileMap;
  forkedFrom?: string;
  shareCount: number;
  isPublic: boolean;
  tags: string[];

  // Metadata
  totalFiles: number;
  totalSize: number;
  framework?: string;
}

export interface ShareLink {
  id: string;
  snapshotId: string;
  code: string; // Encoded snapshot ID
  createdAt: number;
  expiresAt?: number;
  accessCount: number;
}

// Stores
export const sandboxSnapshots: MapStore<Record<string, SandboxSnapshot>> = map({});
export const shareLinks: MapStore<Record<string, ShareLink>> = map({});
export const selectedSnapshotId = atom<string | null>(null);
export const snapshotSearchQuery = atom<string>('');
export const snapshotFilterTag = atom<string>('');

// IndexedDB
const DB_NAME = 'sagex-sandbox-snapshots';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Compress file map to reduce size (strip binary content, limit text size)
function compressFileMap(fileMap: FileMap): FileMap {
  const compressed: FileMap = {};

  for (const [path, dirent] of Object.entries(fileMap)) {
    if (!dirent) {
      continue;
    }

    // Skip common unnecessary files
    if (path.includes('node_modules') || path.includes('.git/') || path.includes('dist/') || path.includes('.next/')) {
      continue;
    }

    if (dirent.type === 'file') {
      // Limit content size for sharing
      let content = dirent.content;

      if (content && content.length > 50000) {
        content = content.substring(0, 50000) + '\n... [truncated]';
      }

      compressed[path] = { ...dirent, content };
    } else {
      compressed[path] = dirent;
    }
  }

  return compressed;
}

// Calculate total size of files
function calculateTotalSize(fileMap: FileMap): number {
  let totalSize = 0;

  for (const dirent of Object.values(fileMap)) {
    if (dirent && dirent.type === 'file') {
      totalSize += dirent.content.length;
    }
  }

  return totalSize;
}

// Save snapshot to IndexedDB
async function persistSnapshot(snapshot: SandboxSnapshot): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(snapshot);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    logger.error('Failed to persist snapshot:', error);
  }
}

// Load all snapshots from IndexedDB
export async function loadSnapshotsFromDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const allSnapshots: Record<string, SandboxSnapshot> = {};

        for (const snapshot of request.result as SandboxSnapshot[]) {
          allSnapshots[snapshot.id] = snapshot;
        }
        sandboxSnapshots.set(allSnapshots);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    db.close();
  } catch (error) {
    logger.error('Failed to load snapshots:', error);
  }
}

// Save current project as a snapshot
export async function saveSnapshot(params: {
  name?: string;
  description?: string;
  fileMap: FileMap;
  tags?: string[];
  isPublic?: boolean;
}): Promise<SandboxSnapshot> {
  const id = `sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const compressedFiles = compressFileMap(params.fileMap);
  const fileCount = Object.values(compressedFiles).filter((d) => d?.type === 'file').length;

  const snapshot: SandboxSnapshot = {
    id,
    name: params.name || `Snapshot ${new Date().toLocaleString()}`,
    description: params.description || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    files: compressedFiles,
    isPublic: params.isPublic ?? true,
    tags: params.tags || [],
    totalFiles: fileCount,
    totalSize: calculateTotalSize(compressedFiles),
    shareCount: 0,
  };

  sandboxSnapshots.setKey(id, snapshot);
  await persistSnapshot(snapshot);

  logger.info(`Saved sandbox snapshot: ${id} - ${snapshot.name}`);

  return snapshot;
}

// Load a snapshot (returns the file map to restore)
export function loadSnapshot(snapshotId: string): FileMap | null {
  const snapshot = sandboxSnapshots.get()[snapshotId];

  if (!snapshot) {
    logger.error(`Snapshot not found: ${snapshotId}`);
    return null;
  }

  selectedSnapshotId.set(snapshotId);

  return snapshot.files;
}

// Fork a snapshot (create a new snapshot from an existing one)
export async function forkSnapshot(sourceSnapshotId: string, newName?: string): Promise<SandboxSnapshot | null> {
  const source = sandboxSnapshots.get()[sourceSnapshotId];

  if (!source) {
    logger.error(`Source snapshot not found: ${sourceSnapshotId}`);
    return null;
  }

  const newSnapshot = await saveSnapshot({
    name: newName || `${source.name} (fork)`,
    description: source.description,
    fileMap: source.files,
    tags: [...source.tags, 'forked'],
    isPublic: source.isPublic,
  });

  // Actually, the new snapshot should have forkedFrom pointing to source
  newSnapshot.forkedFrom = sourceSnapshotId;
  sandboxSnapshots.setKey(newSnapshot.id, newSnapshot);
  await persistSnapshot(newSnapshot);

  // Increment source share count
  const incrementedSource = { ...source, shareCount: source.shareCount + 1 };
  sandboxSnapshots.setKey(sourceSnapshotId, incrementedSource);
  await persistSnapshot(incrementedSource);

  logger.info(`Forked snapshot ${sourceSnapshotId} → ${newSnapshot.id}`);

  return newSnapshot;
}

// Delete a snapshot
export async function deleteSnapshot(snapshotId: string): Promise<boolean> {
  const existing = sandboxSnapshots.get()[snapshotId];

  if (!existing) {
    return false;
  }

  const updated = { ...sandboxSnapshots.get() };
  delete updated[snapshotId];
  sandboxSnapshots.set(updated);

  // Delete from IndexedDB
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(snapshotId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    logger.error('Failed to delete snapshot from DB:', error);
  }

  if (selectedSnapshotId.get() === snapshotId) {
    selectedSnapshotId.set(null);
  }

  logger.info(`Deleted snapshot: ${snapshotId}`);

  return true;
}

// Generate a share link for a snapshot
export function generateShareLink(snapshotId: string): string {
  const snapshot = sandboxSnapshots.get()[snapshotId];

  if (!snapshot) {
    logger.error(`Snapshot not found for sharing: ${snapshotId}`);
    return '';
  }

  /*
   * Encode snapshot data as base64 URL-safe string
   * For large snapshots, we only store the ID and use local DB
   */
  const linkCode = btoa(
    JSON.stringify({
      id: snapshotId,
      name: snapshot.name,
      t: snapshot.createdAt,
    }),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const shareId = `share-${Date.now()}`;
  const link: ShareLink = {
    id: shareId,
    snapshotId,
    code: linkCode,
    createdAt: Date.now(),
    accessCount: 0,
  };

  shareLinks.setKey(shareId, link);

  // Update snapshot share count
  const updatedSnapshot = { ...snapshot, shareCount: snapshot.shareCount + 1 };
  sandboxSnapshots.setKey(snapshotId, updatedSnapshot);
  persistSnapshot(updatedSnapshot);

  // Generate URL
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = `${baseUrl}?snapshot=${linkCode}`;

  logger.info(`Generated share link for snapshot: ${snapshotId}`);

  return shareUrl;
}

// Load snapshot from share link code
export async function loadFromShareCode(code: string): Promise<SandboxSnapshot | null> {
  try {
    // Decode the share code
    const decoded = JSON.parse(atob(code.replace(/-/g, '+').replace(/_/g, '/')));

    // Check if the snapshot exists locally
    const snapshot = sandboxSnapshots.get()[decoded.id];

    if (snapshot) {
      selectedSnapshotId.set(snapshot.id);
      return snapshot;
    }

    // Snapshot not found locally - it might have been shared from elsewhere
    logger.warn(`Snapshot ${decoded.id} not found locally, share link may be from another session`);

    return null;
  } catch (error) {
    logger.error('Failed to decode share link:', error);
    return null;
  }
}

// Export snapshot as downloadable JSON
export function exportSnapshot(snapshotId: string): string | null {
  const snapshot = sandboxSnapshots.get()[snapshotId];

  if (!snapshot) {
    return null;
  }

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    snapshot: {
      name: snapshot.name,
      description: snapshot.description,
      createdAt: new Date(snapshot.createdAt).toISOString(),
      tags: snapshot.tags,
      files: snapshot.files,
    },
  };

  return JSON.stringify(exportData, null, 2);
}

// Import snapshot from JSON
export async function importSnapshot(jsonString: string): Promise<SandboxSnapshot | null> {
  try {
    const data = JSON.parse(jsonString);

    if (!data.snapshot || !data.snapshot.files) {
      logger.error('Invalid snapshot format');
      return null;
    }

    const imported = await saveSnapshot({
      name: `${data.snapshot.name} (imported)`,
      description: data.snapshot.description,
      fileMap: data.snapshot.files,
      tags: [...(data.snapshot.tags || []), 'imported'],
      isPublic: true,
    });

    logger.info('Imported snapshot from JSON');

    return imported;
  } catch (error) {
    logger.error('Failed to import snapshot:', error);
    return null;
  }
}

// Export snapshot as ZIP file
export async function exportSnapshotAsZip(snapshotId: string): Promise<Blob | null> {
  const snapshot = sandboxSnapshots.get()[snapshotId];

  if (!snapshot) {
    return null;
  }

  const zip = new JSZip();

  for (const [filePath, dirent] of Object.entries(snapshot.files)) {
    if (dirent?.type === 'file' && !dirent.isBinary) {
      const relativePath = filePath.replace(/^\/home\/project\//, '');
      zip.file(relativePath, dirent.content);
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}

// Get filtered snapshots based on search and tags
export function getFilteredSnapshots(): SandboxSnapshot[] {
  const all = Object.values(sandboxSnapshots.get());
  const query = snapshotSearchQuery.get().toLowerCase();
  const tag = snapshotFilterTag.get();

  return all
    .filter((s) => {
      const matchesQuery =
        !query ||
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.tags.some((t) => t.toLowerCase().includes(query));

      const matchesTag = !tag || s.tags.includes(tag);

      return matchesQuery && matchesTag;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// Update snapshot metadata
export async function updateSnapshotMeta(
  snapshotId: string,
  updates: { name?: string; description?: string; tags?: string[]; isPublic?: boolean },
): Promise<boolean> {
  const snapshot = sandboxSnapshots.get()[snapshotId];

  if (!snapshot) {
    return false;
  }

  const updated = {
    ...snapshot,
    ...updates,
    updatedAt: Date.now(),
  };

  sandboxSnapshots.setKey(snapshotId, updated);
  await persistSnapshot(updated);

  return true;
}

// Initialize snapshots
export async function initSnapshots(): Promise<void> {
  await loadSnapshotsFromDB();
}
