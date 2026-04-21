import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle, Wrench, Shield, ChevronRight, ChevronDown, X } from 'lucide-react';
import { useState, useCallback } from 'react';
import {
  activeErrorAlert,
  isAutoFixing,
  recoveryStats,
  circuitState,
  webcontainerHealth,
  dismissErrorAlert,
  resolveError,
  getUnresolvedErrors,
  formatCircuitState,
} from '~/lib/runtime/error-recovery';

export default function ErrorRecovery() {
  const $activeAlert = useStore(activeErrorAlert);
  const $isAutoFixing = useStore(isAutoFixing);
  const $stats = useStore(recoveryStats);
  const $circuitState = useStore(circuitState);
  const $wcHealth = useStore(webcontainerHealth);

  const [showHistory, setShowHistory] = useState(false);
  const [expandedError, setExpandedError] = useState<string | null>(null);

  const unresolved = getUnresolvedErrors();
  const circuitInfo = formatCircuitState($circuitState);

  const handleDismiss = useCallback(() => {
    dismissErrorAlert();
  }, []);

  const handleResolve = useCallback((errorId: string) => {
    resolveError(errorId, 'Manually dismissed');
  }, []);

  const healthColor =
    $wcHealth === 'healthy' ? 'text-green-400' : $wcHealth === 'degraded' ? 'text-yellow-400' : 'text-red-400';

  return (
    <>
      {/* Active Error Alert */}
      <AnimatePresence>
        {$activeAlert && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-auto max-w-2xl mb-2"
          >
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 backdrop-blur-sm overflow-hidden">
              <div className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    {$isAutoFixing ? (
                      <Wrench className="w-5 h-5 text-yellow-400 animate-pulse" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-red-300">
                        {$isAutoFixing ? 'Auto-fixing...' : $activeAlert.message}
                      </h4>
                      <button onClick={handleDismiss} className="p-1 hover:bg-white/10 rounded">
                        <X className="w-3.5 h-3.5 text-white/40" />
                      </button>
                    </div>

                    {$activeAlert.details && (
                      <p className="text-xs text-white/40 mt-1">
                        {$activeAlert.details.substring(0, 200)}
                        {$activeAlert.details.length > 200 && '...'}
                      </p>
                    )}

                    {$activeAlert.autoFixCommand && !$isAutoFixing && (
                      <div className="mt-2 flex items-center gap-2">
                        <code className="text-[11px] bg-black/30 px-2 py-1 rounded text-yellow-300 font-mono">
                          {$activeAlert.autoFixCommand}
                        </code>
                      </div>
                    )}

                    {/* Error Analysis Tags */}
                    {$activeAlert.errorAnalysis && (
                      <div className="mt-2 flex gap-2 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">
                          Type: {$activeAlert.errorAnalysis.type}
                        </span>
                        {$activeAlert.errorAnalysis.canAutoFix && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">
                            Auto-fixable
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Suggestions */}
              {$activeAlert.errorAnalysis?.fixDescription && (
                <div className="px-4 py-2 bg-black/20 border-t border-white/5">
                  <p className="text-[11px] text-white/50">
                    <span className="text-white/70 font-medium">Suggestion:</span>{' '}
                    {$activeAlert.errorAnalysis.fixDescription}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Recovery Status Bar (shown in workbench) */}
      {unresolved.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-white/5 bg-[#0d0d14]">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>
              {unresolved.length} unresolved error{unresolved.length > 1 ? 's' : ''}
            </span>
            {showHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-white/30">
              <CheckCircle className="w-3 h-3 text-green-400" />
              {$stats.autoFixedErrors} auto-fixed
            </span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className={`text-[10px] ${circuitInfo.color}`}>{circuitInfo.label}</span>
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                $circuitState === 'closed'
                  ? 'bg-green-400'
                  : $circuitState === 'open'
                    ? 'bg-red-400'
                    : 'bg-yellow-400 animate-pulse'
              }`}
            />
          </div>

          <span className={`text-[10px] ${healthColor}`}>WC: {$wcHealth}</span>
        </div>
      )}

      {/* Error History Panel */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/10 overflow-hidden bg-[#0a0a0f]"
          >
            <div className="max-h-64 overflow-y-auto">
              {unresolved.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-white/20">
                  <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-400/40" />
                  No unresolved errors
                </div>
              ) : (
                <div className="py-1">
                  {unresolved.map((error) => (
                    <div key={error.id} className="border-b border-white/5 last:border-0">
                      <button
                        onClick={() => setExpandedError(expandedError === error.id ? null : error.id)}
                        className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
                      >
                        <AlertTriangle
                          className={`w-3.5 h-3.5 shrink-0 ${
                            error.severity === 'critical'
                              ? 'text-red-400'
                              : error.severity === 'high'
                                ? 'text-orange-400'
                                : error.severity === 'medium'
                                  ? 'text-yellow-400'
                                  : 'text-blue-400'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">{error.message}</p>
                          <p className="text-[10px] text-white/30">
                            {error.type} • {new Date(error.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {error.autoFixSucceeded && <CheckCircle className="w-3 h-3 text-green-400" />}
                          {expandedError === error.id ? (
                            <ChevronDown className="w-3 h-3 text-white/20" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-white/20" />
                          )}
                        </div>
                      </button>

                      <AnimatePresence>
                        {expandedError === error.id && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-2 pl-10 space-y-1">
                              {error.command && (
                                <p className="text-[10px] font-mono text-white/40">
                                  <span className="text-white/60">Command:</span> {error.command}
                                </p>
                              )}
                              {error.autoFixCommand && (
                                <p className="text-[10px] font-mono text-yellow-300/60">
                                  <span className="text-yellow-400/80">Auto-fix:</span> {error.autoFixCommand}
                                </p>
                              )}
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={() => handleResolve(error.id)}
                                  className="text-[10px] text-white/40 hover:text-white px-2 py-0.5 rounded bg-white/5"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
