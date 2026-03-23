import { useStore } from '@nanostores/react';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Panel, type ImperativePanelHandle } from 'react-resizable-panels';
import { IconButton } from '~/components/ui/IconButton';
import { shortcutEventEmitter } from '~/lib/hooks';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { Terminal, type TerminalRef } from './Terminal';
import { TerminalManager } from './TerminalManager';
import { createScopedLogger } from '~/utils/logger';
import { terminalDiagnostics, commandHistory, type TerminalDiagnostics } from '~/utils/shell';

const logger = createScopedLogger('Terminal');

const MAX_TERMINALS = 3;
export const DEFAULT_TERMINAL_SIZE = 25;

// Terminal health indicator component
const TerminalHealthIndicator = memo(({ diagnostics }: { diagnostics: TerminalDiagnostics }) => {
  const getStatusColor = () => {
    switch (diagnostics.status) {
      case 'healthy':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      case 'initializing':
        return 'bg-blue-500 animate-pulse';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (diagnostics.status) {
      case 'healthy':
        return 'Terminal Ready';
      case 'degraded':
        return 'Terminal Degraded';
      case 'error':
        return 'Terminal Error';
      case 'initializing':
        return 'Initializing...';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-bolt-elements-textTertiary" title={getStatusText()}>
      <div className={classNames('w-2 h-2 rounded-full', getStatusColor())}></div>
      {diagnostics.commandCount > 0 && (
        <span>
          {diagnostics.commandCount} cmd{diagnostics.commandCount !== 1 ? 's' : ''}
          {diagnostics.failedCommandCount > 0 && (
            <span className="text-red-400 ml-1">({diagnostics.failedCommandCount} failed)</span>
          )}
        </span>
      )}
    </div>
  );
});

TerminalHealthIndicator.displayName = 'TerminalHealthIndicator';

export const TerminalTabs = memo(() => {
  const showTerminal = useStore(workbenchStore.showTerminal);
  const theme = useStore(themeStore);
  const diagnostics = useStore(terminalDiagnostics);

  const terminalRefs = useRef<Map<number, TerminalRef>>(new Map());
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalToggledByShortcut = useRef(false);

  const [activeTerminal, setActiveTerminal] = useState(0);
  const [terminalCount, setTerminalCount] = useState(0);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const history = useStore(commandHistory);

  const addTerminal = () => {
    if (terminalCount < MAX_TERMINALS) {
      setTerminalCount(terminalCount + 1);
      setActiveTerminal(terminalCount);
    }
  };

  const closeTerminal = useCallback(
    (index: number) => {
      if (index === 0) {
        return;
      } // Can't close bolt terminal

      const terminalRef = terminalRefs.current.get(index);

      if (terminalRef?.getTerminal) {
        const terminal = terminalRef.getTerminal();

        if (terminal) {
          workbenchStore.detachTerminal(terminal);
        }
      }

      // Remove the terminal from refs
      terminalRefs.current.delete(index);

      // Adjust terminal count and active terminal
      setTerminalCount(terminalCount - 1);

      if (activeTerminal === index) {
        setActiveTerminal(Math.max(0, index - 1));
      } else if (activeTerminal > index) {
        setActiveTerminal(activeTerminal - 1);
      }
    },
    [activeTerminal, terminalCount],
  );

  const resetTerminal = useCallback(async () => {
    const ref = terminalRefs.current.get(activeTerminal);

    if (ref?.getTerminal()) {
      const terminal = ref.getTerminal()!;
      terminal.clear();
      terminal.focus();

      if (activeTerminal === 0) {
        workbenchStore.attachBoltTerminal(terminal);
      } else {
        workbenchStore.attachTerminal(terminal);
      }
    }
  }, [activeTerminal]);

  useEffect(() => {
    return () => {
      terminalRefs.current.forEach((ref, index) => {
        if (index > 0 && ref?.getTerminal) {
          const terminal = ref.getTerminal();

          if (terminal) {
            workbenchStore.detachTerminal(terminal);
          }
        }
      });
    };
  }, []);

  useEffect(() => {
    const { current: terminal } = terminalPanelRef;

    if (!terminal) {
      return;
    }

    const isCollapsed = terminal.isCollapsed();

    if (!showTerminal && !isCollapsed) {
      terminal.collapse();
    } else if (showTerminal && isCollapsed) {
      terminal.resize(DEFAULT_TERMINAL_SIZE);
    }

    terminalToggledByShortcut.current = false;
  }, [showTerminal]);

  useEffect(() => {
    const unsubscribeFromEventEmitter = shortcutEventEmitter.on('toggleTerminal', () => {
      terminalToggledByShortcut.current = true;
    });

    const unsubscribeFromThemeStore = themeStore.subscribe(() => {
      terminalRefs.current.forEach((ref) => {
        ref?.reloadStyles();
      });
    });

    return () => {
      unsubscribeFromEventEmitter();
      unsubscribeFromThemeStore();
    };
  }, []);

  return (
    <Panel
      ref={terminalPanelRef}
      defaultSize={showTerminal ? DEFAULT_TERMINAL_SIZE : 0}
      minSize={10}
      collapsible
      onExpand={() => {
        if (!terminalToggledByShortcut.current) {
          workbenchStore.toggleTerminal(true);
        }
      }}
      onCollapse={() => {
        if (!terminalToggledByShortcut.current) {
          workbenchStore.toggleTerminal(false);
        }
      }}
    >
      <div className="h-full">
        <div className="bg-bolt-elements-terminals-background h-full flex flex-col">
          <div className="flex items-center bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor gap-1.5 min-h-[34px] p-2">
            {Array.from({ length: terminalCount + 1 }, (_, index) => {
              const isActive = activeTerminal === index;

              return (
                <React.Fragment key={index}>
                  {index == 0 ? (
                    <button
                      key={index}
                      className={classNames(
                        'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                        {
                          'bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary':
                            isActive,
                          'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-terminals-buttonBackground':
                            !isActive,
                        },
                      )}
                      onClick={() => setActiveTerminal(index)}
                    >
                      <div className="i-ph:terminal-window-duotone text-lg" />
                      Bolt Terminal
                    </button>
                  ) : (
                    <React.Fragment>
                      <button
                        key={index}
                        className={classNames(
                          'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                          {
                            'bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary': isActive,
                            'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-terminals-buttonBackground':
                              !isActive,
                          },
                        )}
                        onClick={() => setActiveTerminal(index)}
                      >
                        <div className="i-ph:terminal-window-duotone text-lg" />
                        Terminal {terminalCount > 1 && index}
                        <button
                          className="bg-transparent text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-transparent rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTerminal(index);
                          }}
                        >
                          <div className="i-ph:x text-xs" />
                        </button>
                      </button>
                    </React.Fragment>
                  )}
                </React.Fragment>
              );
            })}
            {terminalCount < MAX_TERMINALS && <IconButton icon="i-ph:plus" size="md" onClick={addTerminal} />}
            <IconButton icon="i-ph:arrow-clockwise" title="Reset Terminal" size="md" onClick={resetTerminal} />
            <IconButton
              icon="i-ph:clock-counter-clockwise"
              title="Command History"
              size="md"
              onClick={() => setShowHistory(!showHistory)}
              className={showHistory ? 'text-bolt-elements-item-contentAccent' : ''}
            />
            <IconButton
              icon="i-ph:info"
              title="Terminal Diagnostics"
              size="md"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className={showDiagnostics ? 'text-bolt-elements-item-contentAccent' : ''}
            />

            {/* Health indicator */}
            <div className="ml-2">
              <TerminalHealthIndicator diagnostics={diagnostics} />
            </div>

            <IconButton
              className="ml-auto"
              icon="i-ph:caret-down"
              title="Close"
              size="md"
              onClick={() => workbenchStore.toggleTerminal(false)}
            />
          </div>

          {/* Command History Panel */}
          {showHistory && (
            <div className="bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor p-2 max-h-40 overflow-y-auto">
              <div className="text-xs text-bolt-elements-textTertiary mb-2 flex justify-between items-center">
                <span>Command History (Last 20)</span>
                <button
                  onClick={() => {
                    commandHistory.set([]);
                    setShowHistory(false);
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  Clear
                </button>
              </div>
              {history.length === 0 ? (
                <div className="text-xs text-bolt-elements-textTertiary italic">No commands in history</div>
              ) : (
                <div className="space-y-1">
                  {history.slice(0, 20).map((entry, i) => (
                    <div
                      key={i}
                      className={classNames(
                        'text-xs font-mono p-1.5 rounded cursor-pointer hover:bg-bolt-elements-background-depth-3',
                        entry.exitCode === 0 ? 'text-green-400' : 'text-red-400',
                      )}
                      title={`Exit code: ${entry.exitCode}`}
                      onClick={() => {
                        // Copy command to clipboard
                        navigator.clipboard.writeText(entry.command);
                        setShowHistory(false);
                      }}
                    >
                      <span className="text-bolt-elements-textTertiary mr-2">${entry.exitCode}</span>
                      {entry.command}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Diagnostics Panel */}
          {showDiagnostics && (
            <div className="bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor p-3">
              <div className="text-xs text-bolt-elements-textTertiary mb-2">Terminal Diagnostics</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-bolt-elements-textTertiary">Status:</span>{' '}
                  <span
                    className={classNames(
                      diagnostics.status === 'healthy'
                        ? 'text-green-400'
                        : diagnostics.status === 'error'
                          ? 'text-red-400'
                          : 'text-yellow-400',
                    )}
                  >
                    {diagnostics.status}
                  </span>
                </div>
                <div>
                  <span className="text-bolt-elements-textTertiary">Commands:</span> {diagnostics.commandCount}
                </div>
                <div>
                  <span className="text-bolt-elements-textTertiary">Failed:</span>{' '}
                  <span className={diagnostics.failedCommandCount > 0 ? 'text-red-400' : ''}>
                    {diagnostics.failedCommandCount}
                  </span>
                </div>
                <div>
                  <span className="text-bolt-elements-textTertiary">WebContainer:</span>{' '}
                  <span className={diagnostics.webcontainerReady ? 'text-green-400' : 'text-yellow-400'}>
                    {diagnostics.webcontainerReady ? 'Ready' : 'Not Ready'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-bolt-elements-textTertiary">Uptime:</span>{' '}
                  {Math.floor(diagnostics.uptime / 1000)}s
                </div>
                {diagnostics.lastError && (
                  <div className="col-span-2 text-red-400 truncate" title={diagnostics.lastError}>
                    <span className="text-bolt-elements-textTertiary">Last Error:</span> {diagnostics.lastError}
                  </div>
                )}
              </div>
              {diagnostics.status === 'error' && (
                <button
                  onClick={resetTerminal}
                  className="mt-2 px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                >
                  Reset Terminal
                </button>
              )}
            </div>
          )}

          {Array.from({ length: terminalCount + 1 }, (_, index) => {
            const isActive = activeTerminal === index;

            logger.debug(`Starting bolt terminal [${index}]`);

            if (index == 0) {
              return (
                <React.Fragment key={`terminal-container-${index}`}>
                  <Terminal
                    key={`terminal-${index}`}
                    id={`terminal_${index}`}
                    className={classNames('h-full overflow-hidden modern-scrollbar-invert', {
                      hidden: !isActive,
                    })}
                    ref={(ref) => {
                      if (ref) {
                        terminalRefs.current.set(index, ref);
                      }
                    }}
                    onTerminalReady={(terminal) => workbenchStore.attachBoltTerminal(terminal)}
                    onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                    theme={theme}
                  />
                  <TerminalManager
                    terminal={terminalRefs.current.get(index)?.getTerminal() || null}
                    isActive={isActive}
                  />
                </React.Fragment>
              );
            } else {
              return (
                <React.Fragment key={`terminal-container-${index}`}>
                  <Terminal
                    key={`terminal-${index}`}
                    id={`terminal_${index}`}
                    className={classNames('modern-scrollbar h-full overflow-hidden', {
                      hidden: !isActive,
                    })}
                    ref={(ref) => {
                      if (ref) {
                        terminalRefs.current.set(index, ref);
                      }
                    }}
                    onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminal)}
                    onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                    theme={theme}
                  />
                  <TerminalManager
                    terminal={terminalRefs.current.get(index)?.getTerminal() || null}
                    isActive={isActive}
                  />
                </React.Fragment>
              );
            }
          })}
        </div>
      </div>
    </Panel>
  );
});
