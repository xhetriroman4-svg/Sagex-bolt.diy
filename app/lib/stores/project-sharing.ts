/**
 * Project Sharing System
 * Allows users to share projects privately via shareable links
 */

import { atom, map, type MapStore } from 'nanostores';
import type { Message } from 'ai';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ProjectSharing');

// Share permission levels
export type SharePermission = 'view' | 'edit' | 'full';

// Shared project metadata
export interface SharedProject {
  id: string;
  shareId: string;
  title: string;
  description?: string;
  createdAt: number;
  expiresAt?: number;
  permission: SharePermission;
  accessCount: number;
  lastAccessedAt?: number;
  createdBy?: string;
  isPublic: boolean;
  password?: string; // Optional password protection
}

// Share link info
export interface ShareLink {
  shareId: string;
  url: string;
  expiresAt?: number;
  permission: SharePermission;
  password?: string;
}

// Sharing store
export const sharedProjects: MapStore<Record<string, SharedProject>> = import.meta.hot?.data.sharedProjects ?? map({});
export const shareLinksGenerated = atom<string[]>(import.meta.hot?.data.shareLinksGenerated ?? []);

if (import.meta.hot) {
  import.meta.hot.data.sharedProjects = sharedProjects;
  import.meta.hot.data.shareLinksGenerated = shareLinksGenerated;
}

/**
 * Generate a unique share ID
 */
export function generateShareId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Create a shareable link for a project
 */
export function createShareLink(
  projectId: string,
  title: string,
  options: {
    permission?: SharePermission;
    expiresIn?: number; // milliseconds
    password?: string;
    isPublic?: boolean;
  } = {},
): ShareLink {
  const shareId = generateShareId();
  const { permission = 'view', expiresIn, password, isPublic = true } = options;

  const sharedProject: SharedProject = {
    id: projectId,
    shareId,
    title,
    createdAt: Date.now(),
    expiresAt: expiresIn ? Date.now() + expiresIn : undefined,
    permission,
    accessCount: 0,
    isPublic,
    password: password ? hashPassword(password) : undefined,
  };

  sharedProjects.setKey(shareId, sharedProject);

  const url = `${window.location.origin}/share/${shareId}`;

  return {
    shareId,
    url,
    expiresAt: sharedProject.expiresAt,
    permission,
    password,
  };
}

/**
 * Verify access to a shared project
 */
export function verifyShareAccess(
  shareId: string,
  password?: string,
): {
  granted: boolean;
  project?: SharedProject;
  reason?: string;
} {
  const projects = sharedProjects.get();
  const project = projects[shareId];

  if (!project) {
    return { granted: false, reason: 'Share link not found' };
  }

  // Check expiration
  if (project.expiresAt && Date.now() > project.expiresAt) {
    return { granted: false, reason: 'Share link has expired' };
  }

  // Check password
  if (project.password) {
    if (!password) {
      return { granted: false, reason: 'Password required' };
    }
    if (hashPassword(password) !== project.password) {
      return { granted: false, reason: 'Invalid password' };
    }
  }

  // Update access stats
  const updatedProject: SharedProject = {
    ...project,
    accessCount: project.accessCount + 1,
    lastAccessedAt: Date.now(),
  };
  sharedProjects.setKey(shareId, updatedProject);

  return { granted: true, project };
}

/**
 * Revoke a share link
 */
export function revokeShareLink(shareId: string): boolean {
  const projects = sharedProjects.get();
  if (projects[shareId]) {
    sharedProjects.setKey(shareId, undefined as any);
    return true;
  }
  return false;
}

/**
 * Get all shares for a project
 */
export function getProjectShares(projectId: string): SharedProject[] {
  const projects = sharedProjects.get();
  return Object.values(projects).filter((p) => p.id === projectId);
}

/**
 * Update share permissions
 */
export function updateSharePermission(
  shareId: string,
  permission: SharePermission,
): boolean {
  const projects = sharedProjects.get();
  const project = projects[shareId];

  if (project) {
    sharedProjects.setKey(shareId, { ...project, permission });
    return true;
  }
  return false;
}

/**
 * Extend share expiration
 */
export function extendShareExpiration(
  shareId: string,
  additionalTime: number, // milliseconds
): boolean {
  const projects = sharedProjects.get();
  const project = projects[shareId];

  if (project) {
    const newExpiresAt = project.expiresAt
      ? project.expiresAt + additionalTime
      : Date.now() + additionalTime;
    sharedProjects.setKey(shareId, { ...project, expiresAt: newExpiresAt });
    return true;
  }
  return false;
}

/**
 * Simple password hashing (for basic protection)
 */
function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Export project as shareable data
 */
export async function exportProjectForShare(
  projectId: string,
  files: Record<string, any>,
  messages: Message[],
): Promise<string> {
  const exportData = {
    version: 1,
    exportedAt: Date.now(),
    projectId,
    files,
    messages,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Import project from shared data
 */
export async function importProjectFromShare(
  shareData: string,
): Promise<{
  files: Record<string, any>;
  messages: Message[];
  projectId: string;
}> {
  try {
    const parsed = JSON.parse(shareData);

    if (parsed.version !== 1) {
      throw new Error('Unsupported share data version');
    }

    return {
      files: parsed.files,
      messages: parsed.messages,
      projectId: parsed.projectId,
    };
  } catch (error) {
    logger.error('Failed to import project from share:', error);
    throw new Error('Invalid share data');
  }
}

/**
 * Copy share link to clipboard
 */
export async function copyShareLinkToClipboard(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch (error) {
    logger.error('Failed to copy to clipboard:', error);
    return false;
  }
}
