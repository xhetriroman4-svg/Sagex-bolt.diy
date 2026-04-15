import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { currentSessionUsage, usageLimits, formatTokenCount, getUsagePercentage } from '~/lib/stores/token-tracker';
import { sharedProjects, revokeShareLink } from '~/lib/stores/project-sharing';
import { classNames } from '~/utils/classNames';

interface UsagePanelProps {
  className?: string;
}

export function UsagePanel({ className }: UsagePanelProps) {
  const [activeTab, setActiveTab] = useState<'usage' | 'sharing'>('usage');
  const sessionUsage = useStore(currentSessionUsage);
  const limits = useStore(usageLimits);
  const projects = useStore(sharedProjects);

  // Calculate today's usage (simplified)
  const todayUsage = sessionUsage.input + sessionUsage.output;
  const todayPercent = getUsagePercentage(todayUsage, limits.dailyLimit);

  const shares = Object.values(projects);

  return (
    <div className={classNames('p-4 space-y-4', className)}>
      {/* Tabs */}
      <div className="flex gap-2 border-b border-bolt-elements-borderColor pb-2">
        <button
          onClick={() => setActiveTab('usage')}
          className={classNames(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            activeTab === 'usage'
              ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
          )}
        >
          Token Usage
        </button>
        <button
          onClick={() => setActiveTab('sharing')}
          className={classNames(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            activeTab === 'sharing'
              ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
          )}
        >
          Project Sharing
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'usage' ? (
          <motion.div
            key="usage"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Session Usage */}
            <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4">
              <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Current Session</h3>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-2xl font-bold text-bolt-elements-textPrimary">
                    {formatTokenCount(sessionUsage.input + sessionUsage.output)}
                  </span>
                  <span className="text-sm text-bolt-elements-textSecondary ml-1">tokens</span>
                </div>
                <div className="text-right text-sm text-bolt-elements-textSecondary">
                  <div>Input: {formatTokenCount(sessionUsage.input)}</div>
                  <div>Output: {formatTokenCount(sessionUsage.output)}</div>
                </div>
              </div>
            </div>

            {/* Daily Limit */}
            <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Daily Limit</h3>
                <span
                  className={classNames(
                    'text-sm font-medium',
                    todayPercent >= 80 ? 'text-red-500' : todayPercent >= 50 ? 'text-yellow-500' : 'text-green-500',
                  )}
                >
                  {todayPercent}%
                </span>
              </div>
              <div className="w-full bg-bolt-elements-background-depth-3 rounded-full h-2.5 mb-2">
                <div
                  className={classNames(
                    'h-2.5 rounded-full transition-all',
                    todayPercent >= 80 ? 'bg-red-500' : todayPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500',
                  )}
                  style={{ width: `${Math.min(100, todayPercent)}%` }}
                />
              </div>
              <div className="text-xs text-bolt-elements-textSecondary">
                {formatTokenCount(todayUsage)} / {formatTokenCount(limits.dailyLimit)} daily limit
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <div className="i-ph:info text-blue-400 mt-0.5" />
                <div className="text-sm text-blue-400">
                  <p className="font-medium mb-1">About Token Usage</p>
                  <p className="text-xs text-blue-300">
                    Tokens are consumed when generating code and chat responses. This is a local estimate and may differ
                    from your provider's actual billing.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="sharing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {shares.length === 0 ? (
              <div className="bg-bolt-elements-background-depth-2 rounded-lg p-6 text-center">
                <div className="i-ph:share-network text-4xl text-bolt-elements-textSecondary mb-2 mx-auto" />
                <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-1">No Shared Projects</h3>
                <p className="text-xs text-bolt-elements-textSecondary">
                  Create shareable links for your projects to share them with others
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {shares.map((share) => (
                  <div
                    key={share.shareId}
                    className="bg-bolt-elements-background-depth-2 rounded-lg p-3 flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-bolt-elements-textPrimary truncate">{share.title}</h4>
                      <div className="flex gap-2 text-xs text-bolt-elements-textSecondary mt-1">
                        <span className="flex items-center gap-1">
                          <div className="i-ph:eye text-xs" />
                          {share.accessCount} views
                        </span>
                        {share.password && (
                          <span className="flex items-center gap-1">
                            <div className="i-ph:lock text-xs" />
                            Protected
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/share/${share.shareId}`);
                        }}
                        className="p-1.5 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
                        title="Copy link"
                      >
                        <div className="i-ph:copy text-sm" />
                      </button>
                      <button
                        onClick={() => revokeShareLink(share.shareId)}
                        className="p-1.5 text-bolt-elements-textSecondary hover:text-red-500 hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
                        title="Revoke access"
                      >
                        <div className="i-ph:trash text-sm" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
