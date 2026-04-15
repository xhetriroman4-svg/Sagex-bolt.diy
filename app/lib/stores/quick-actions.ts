/**
 * Quick Actions System
 * Provides one-click actions for common development tasks
 */

import { atom, map, type MapStore } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('QuickActions');

// Quick action types
export type QuickActionCategory = 'code' | 'git' | 'deploy' | 'utils' | 'ai';

// Quick action definition
export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon: string;
  category: QuickActionCategory;
  shortcut?: string;
  action: () => Promise<void> | void;
  condition?: () => boolean; // Whether to show this action
  confirmMessage?: string; // Confirmation dialog message
  isDestructive?: boolean; // Shows warning styling
}

// Quick action group
export interface QuickActionGroup {
  category: QuickActionCategory;
  label: string;
  actions: QuickAction[];
}

// Recently used actions
export const recentActions = atom<string[]>([]);
export const favoriteActions = atom<string[]>([]);

// Quick actions registry
const quickActionsRegistry: MapStore<Record<string, QuickAction>> = map({});

/**
 * Register a quick action
 */
export function registerQuickAction(action: QuickAction): void {
  quickActionsRegistry.setKey(action.id, action);
  logger.debug(`Registered quick action: ${action.id}`);
}

/**
 * Unregister a quick action
 */
export function unregisterQuickAction(actionId: string): void {
  quickActionsRegistry.setKey(actionId, undefined as any);
  logger.debug(`Unregistered quick action: ${actionId}`);
}

/**
 * Get all registered quick actions
 */
export function getAllQuickActions(): QuickAction[] {
  const actions = quickActionsRegistry.get();
  return Object.values(actions).filter(Boolean);
}

/**
 * Get quick actions by category
 */
export function getQuickActionsByCategory(category: QuickActionCategory): QuickAction[] {
  return getAllQuickActions().filter((action) => action.category === category);
}

/**
 * Get visible quick actions (that pass their condition)
 */
export function getVisibleQuickActions(): QuickAction[] {
  return getAllQuickActions().filter((action) => {
    if (action.condition) {
      return action.condition();
    }

    return true;
  });
}

/**
 * Execute a quick action
 */
export async function executeQuickAction(actionId: string): Promise<void> {
  const actions = quickActionsRegistry.get();
  const action = actions[actionId];

  if (!action) {
    logger.error(`Quick action not found: ${actionId}`);
    return;
  }

  try {
    // Check condition
    if (action.condition && !action.condition()) {
      logger.warn(`Action condition not met: ${actionId}`);
      return;
    }

    // Execute action
    await action.action();

    // Add to recent actions
    const recent = recentActions.get();
    recentActions.set([actionId, ...recent.filter((id) => id !== actionId)].slice(0, 10));

    logger.debug(`Executed quick action: ${actionId}`);
  } catch (error) {
    logger.error(`Failed to execute quick action ${actionId}:`, error);
    throw error;
  }
}

/**
 * Toggle favorite action
 */
export function toggleFavoriteAction(actionId: string): void {
  const favorites = favoriteActions.get();
  const index = favorites.indexOf(actionId);

  if (index === -1) {
    favoriteActions.set([...favorites, actionId]);
  } else {
    favoriteActions.set(favorites.filter((id) => id !== actionId));
  }
}

/**
 * Get favorite actions
 */
export function getFavoriteActions(): QuickAction[] {
  const favorites = favoriteActions.get();
  const actions = quickActionsRegistry.get();

  return favorites.map((id) => actions[id]).filter(Boolean);
}

/**
 * Get recent actions
 */
export function getRecentActions(): QuickAction[] {
  const recent = recentActions.get();
  const actions = quickActionsRegistry.get();

  return recent.map((id) => actions[id]).filter(Boolean);
}

/**
 * Register default quick actions
 */
export function registerDefaultQuickActions(): void {
  // Code actions
  registerQuickAction({
    id: 'format-code',
    label: 'Format Code',
    description: 'Format the current file',
    icon: 'i-ph:code',
    category: 'code',
    shortcut: 'Shift+Alt+F',
    action: async () => {
      // This will be connected to the editor
      logger.info('Format code action triggered');
    },
  });

  registerQuickAction({
    id: 'fix-imports',
    label: 'Fix Imports',
    description: 'Auto-fix import statements',
    icon: 'i-ph:package',
    category: 'code',
    action: async () => {
      logger.info('Fix imports action triggered');
    },
  });

  registerQuickAction({
    id: 'add-comments',
    label: 'Add Comments',
    description: 'Add comments to selected code',
    icon: 'i-ph:chat-text',
    category: 'ai',
    action: async () => {
      logger.info('Add comments action triggered');
    },
  });

  registerQuickAction({
    id: 'explain-code',
    label: 'Explain Code',
    description: 'Get AI explanation of selected code',
    icon: 'i-ph:info',
    category: 'ai',
    action: async () => {
      logger.info('Explain code action triggered');
    },
  });

  // Git actions
  registerQuickAction({
    id: 'git-commit',
    label: 'Quick Commit',
    description: 'Stage all and commit',
    icon: 'i-ph:git-commit',
    category: 'git',
    shortcut: 'Ctrl+Shift+G',
    action: async () => {
      logger.info('Quick commit action triggered');
    },
  });

  registerQuickAction({
    id: 'git-push',
    label: 'Push Changes',
    description: 'Push to remote repository',
    icon: 'i-ph:upload-simple',
    category: 'git',
    action: async () => {
      logger.info('Push action triggered');
    },
  });

  // Deploy actions
  registerQuickAction({
    id: 'deploy-vercel',
    label: 'Deploy to Vercel',
    description: 'One-click deploy to Vercel',
    icon: 'i-simple-icons:vercel',
    category: 'deploy',
    action: async () => {
      logger.info('Vercel deploy action triggered');
    },
  });

  registerQuickAction({
    id: 'deploy-netlify',
    label: 'Deploy to Netlify',
    description: 'One-click deploy to Netlify',
    icon: 'i-simple-icons:netlify',
    category: 'deploy',
    action: async () => {
      logger.info('Netlify deploy action triggered');
    },
  });

  // Utility actions
  registerQuickAction({
    id: 'clear-terminal',
    label: 'Clear Terminal',
    description: 'Clear the terminal output',
    icon: 'i-ph:terminal',
    category: 'utils',
    shortcut: 'Ctrl+L',
    action: async () => {
      logger.info('Clear terminal action triggered');
    },
  });

  registerQuickAction({
    id: 'restart-dev-server',
    label: 'Restart Dev Server',
    description: 'Restart the development server',
    icon: 'i-ph:arrow-clockwise',
    category: 'utils',
    action: async () => {
      logger.info('Restart dev server action triggered');
    },
  });

  registerQuickAction({
    id: 'download-project',
    label: 'Download Project',
    description: 'Download project as ZIP',
    icon: 'i-ph:download-simple',
    category: 'utils',
    action: async () => {
      logger.info('Download project action triggered');
    },
  });

  registerQuickAction({
    id: 'share-project',
    label: 'Share Project',
    description: 'Create a shareable link',
    icon: 'i-ph:share-network',
    category: 'utils',
    action: async () => {
      logger.info('Share project action triggered');
    },
  });

  logger.info('Registered default quick actions');
}

// Auto-register default actions
if (typeof window !== 'undefined') {
  registerDefaultQuickActions();
}
