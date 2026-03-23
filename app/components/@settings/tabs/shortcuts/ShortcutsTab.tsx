import React, { useState, memo } from 'react';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';

interface ShortcutItem {
  id: string;
  category: string;
  action: string;
  keys: string[];
  description?: string;
}

const SHORTCUTS: ShortcutItem[] = [
  // General
  {
    id: '1',
    category: 'General',
    action: 'Toggle Theme',
    keys: ['Cmd', 'Shift', 'D'],
    description: 'Switch between light and dark mode',
  },
  { id: '2', category: 'General', action: 'Open Settings', keys: ['Cmd', ','], description: 'Open the settings panel' },
  {
    id: '3',
    category: 'General',
    action: 'Toggle Terminal',
    keys: ['Ctrl', '`'],
    description: 'Show/hide the terminal panel',
  },
  { id: '4', category: 'General', action: 'Search Files', keys: ['Cmd', 'P'], description: 'Quick file search' },
  {
    id: '5',
    category: 'General',
    action: 'Command Palette',
    keys: ['Cmd', 'Shift', 'P'],
    description: 'Open command palette',
  },

  // Editor
  { id: '6', category: 'Editor', action: 'Save File', keys: ['Cmd', 'S'], description: 'Save current file' },
  {
    id: '7',
    category: 'Editor',
    action: 'Format Code',
    keys: ['Cmd', 'Shift', 'F'],
    description: 'Format the current file',
  },
  { id: '8', category: 'Editor', action: 'Find', keys: ['Cmd', 'F'], description: 'Find in current file' },
  {
    id: '9',
    category: 'Editor',
    action: 'Find & Replace',
    keys: ['Cmd', 'H'],
    description: 'Find and replace in file',
  },
  {
    id: '10',
    category: 'Editor',
    action: 'Go to Line',
    keys: ['Cmd', 'G'],
    description: 'Jump to specific line number',
  },
  {
    id: '11',
    category: 'Editor',
    action: 'Toggle Word Wrap',
    keys: ['Alt', 'Z'],
    description: 'Toggle word wrap in editor',
  },
  {
    id: '12',
    category: 'Editor',
    action: 'Fold Code',
    keys: ['Cmd', 'Shift', '['],
    description: 'Fold current code block',
  },
  {
    id: '13',
    category: 'Editor',
    action: 'Unfold Code',
    keys: ['Cmd', 'Shift', ']'],
    description: 'Unfold current code block',
  },

  // Chat
  { id: '14', category: 'Chat', action: 'Send Message', keys: ['Enter'], description: 'Send the current message' },
  { id: '15', category: 'Chat', action: 'New Line', keys: ['Shift', 'Enter'], description: 'Add new line in message' },
  { id: '16', category: 'Chat', action: 'Clear Chat', keys: ['Cmd', 'K'], description: 'Clear the chat history' },
  { id: '17', category: 'Chat', action: 'Export Chat', keys: ['Cmd', 'E'], description: 'Export chat to file' },

  // Navigation
  {
    id: '18',
    category: 'Navigation',
    action: 'Previous File',
    keys: ['Cmd', 'Up'],
    description: 'Go to previous file',
  },
  { id: '19', category: 'Navigation', action: 'Next File', keys: ['Cmd', 'Down'], description: 'Go to next file' },
  { id: '20', category: 'Navigation', action: 'Close Tab', keys: ['Cmd', 'W'], description: 'Close current tab' },
  {
    id: '21',
    category: 'Navigation',
    action: 'Reopen Closed Tab',
    keys: ['Cmd', 'Shift', 'T'],
    description: 'Reopen last closed tab',
  },

  // Preview
  {
    id: '22',
    category: 'Preview',
    action: 'Refresh Preview',
    keys: ['Cmd', 'R'],
    description: 'Refresh the preview panel',
  },
  {
    id: '23',
    category: 'Preview',
    action: 'Toggle Preview',
    keys: ['Cmd', 'Shift', 'V'],
    description: 'Show/hide preview panel',
  },
  {
    id: '24',
    category: 'Preview',
    action: 'Open in New Tab',
    keys: ['Cmd', 'Click'],
    description: 'Open link in new tab',
  },

  // Debug
  {
    id: '25',
    category: 'Debug',
    action: 'Toggle DevTools',
    keys: ['Cmd', 'Shift', 'I'],
    description: 'Open browser DevTools',
  },
  {
    id: '26',
    category: 'Debug',
    action: 'Inspect Element',
    keys: ['Cmd', 'Shift', 'C'],
    description: 'Inspect element mode',
  },
];

const CATEGORIES = ['All', 'General', 'Editor', 'Chat', 'Navigation', 'Preview', 'Debug'];

const KeyBadge = memo(({ keyName }: { keyName: string }) => (
  <span className="px-2 py-1 text-xs font-mono bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary">
    {keyName}
  </span>
));

const ShortcutRow = memo(({ shortcut }: { shortcut: ShortcutItem }) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    className={classNames(
      'flex items-center justify-between p-3 rounded-lg',
      'bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3',
      'transition-colors duration-200',
    )}
  >
    <div className="flex-1">
      <h4 className="font-medium text-bolt-elements-textPrimary">{shortcut.action}</h4>
      {shortcut.description && <p className="text-xs text-bolt-elements-textTertiary mt-0.5">{shortcut.description}</p>}
    </div>
    <div className="flex items-center gap-1">
      {shortcut.keys.map((key, index) => (
        <React.Fragment key={index}>
          <KeyBadge keyName={key} />
          {index < shortcut.keys.length - 1 && (
            <span className="text-bolt-elements-textTertiary text-xs mx-0.5">+</span>
          )}
        </React.Fragment>
      ))}
    </div>
  </motion.div>
));

export default function ShortcutsTab() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredShortcuts = SHORTCUTS.filter((shortcut) => {
    const matchesCategory = selectedCategory === 'All' || shortcut.category === selectedCategory;
    const matchesSearch =
      shortcut.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shortcut.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shortcut.keys.some((key) => key.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  const groupedShortcuts = filteredShortcuts.reduce(
    (acc, shortcut) => {
      const category = shortcut.category;

      if (!acc[category]) {
        acc[category] = [];
      }

      acc[category].push(shortcut);

      return acc;
    },
    {} as Record<string, ShortcutItem[]>,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-bolt-elements-textPrimary">Keyboard Shortcuts</h2>
        <p className="text-bolt-elements-textSecondary">
          Master SageX with these keyboard shortcuts to boost your productivity
        </p>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <div className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-bolt-elements-textTertiary" />
          <input
            type="text"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-purple-500/30"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={classNames(
                'px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-all',
                selectedCategory === category
                  ? 'bg-purple-500 text-white'
                  : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
              )}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Shortcuts List */}
      <div className="flex flex-col gap-6">
        {selectedCategory === 'All' ? (
          Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3"
            >
              <h3 className="text-lg font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
                <div
                  className={classNames(
                    category === 'General' && 'i-ph:gear',
                    category === 'Editor' && 'i-ph:code',
                    category === 'Chat' && 'i-ph:chat-circle',
                    category === 'Navigation' && 'i-ph:compass',
                    category === 'Preview' && 'i-ph:eye',
                    category === 'Debug' && 'i-ph:bug',
                    'w-5 h-5 text-purple-400',
                  )}
                />
                {category}
              </h3>
              <div className="flex flex-col gap-2">
                {shortcuts.map((shortcut) => (
                  <ShortcutRow key={shortcut.id} shortcut={shortcut} />
                ))}
              </div>
            </motion.div>
          ))
        ) : (
          <div className="flex flex-col gap-2">
            {filteredShortcuts.map((shortcut) => (
              <ShortcutRow key={shortcut.id} shortcut={shortcut} />
            ))}
          </div>
        )}
      </div>

      {filteredShortcuts.length === 0 && (
        <div className="text-center py-12">
          <div className="i-ph:keyboard w-16 h-16 mx-auto text-bolt-elements-textTertiary mb-4" />
          <p className="text-bolt-elements-textSecondary">No shortcuts found matching your search</p>
        </div>
      )}

      {/* Footer Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-4 p-4 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor"
      >
        <div className="flex items-start gap-3">
          <div className="i-ph:info w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-bolt-elements-textPrimary mb-1">Pro Tips</h4>
            <ul className="text-sm text-bolt-elements-textSecondary space-y-1">
              <li>
                Use <KeyBadge keyName="Cmd" /> + <KeyBadge keyName="K" /> to quickly access the command palette
              </li>
              <li>
                Most shortcuts work with <KeyBadge keyName="Ctrl" /> on Windows/Linux instead of{' '}
                <KeyBadge keyName="Cmd" />
              </li>
              <li>You can customize shortcuts in the Settings tab</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
