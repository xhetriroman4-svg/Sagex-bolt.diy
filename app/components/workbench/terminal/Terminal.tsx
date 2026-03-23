import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal as XTerm } from '@xterm/xterm';
import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react';
import type { Theme } from '~/lib/stores/theme';
import { createScopedLogger } from '~/utils/logger';
import { getTerminalTheme } from './theme';

const logger = createScopedLogger('Terminal');

export interface TerminalRef {
  reloadStyles: () => void;
  getTerminal: () => XTerm | undefined;
}

export interface TerminalProps {
  className?: string;
  theme: Theme;
  readonly?: boolean;
  id: string;
  onTerminalReady?: (terminal: XTerm) => void;
  onTerminalResize?: (cols: number, rows: number) => void;
}

export const Terminal = memo(
  forwardRef<TerminalRef, TerminalProps>(
    ({ className, theme, readonly, id, onTerminalReady, onTerminalResize }, ref) => {
      const terminalElementRef = useRef<HTMLDivElement>(null);
      const terminalRef = useRef<XTerm>();
      const fitAddonRef = useRef<FitAddon>();
      const resizeObserverRef = useRef<ResizeObserver>();

      useEffect(() => {
        const element = terminalElementRef.current!;

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();
        fitAddonRef.current = fitAddon;

        const terminal = new XTerm({
          cursorBlink: true,
          convertEol: true,
          disableStdin: readonly,
          theme: getTerminalTheme(readonly ? { cursor: '#00000000' } : {}),
          fontSize: 12,
          fontFamily: 'Menlo, courier-new, courier, monospace',
          allowProposedApi: true,
          scrollback: 1000,

          // Enable better clipboard handling
          rightClickSelectsWord: true,
        });

        terminalRef.current = terminal;

        // Error handling for addon loading
        try {
          terminal.loadAddon(fitAddon);
          terminal.loadAddon(webLinksAddon);
          terminal.open(element);

          logger.debug(`Terminal [${id}] initialized successfully`);
        } catch (error) {
          logger.error(`Failed to initialize terminal [${id}]:`, error);

          // Update diagnostics
          import('~/utils/shell')
            .then(({ terminalDiagnostics }) => {
              const current = terminalDiagnostics.get();
              terminalDiagnostics.set({
                ...current,
                status: 'error',
                lastError: error instanceof Error ? error.message : 'Terminal initialization failed',
              });
            })
            .catch(() => {});

          // Attempt recovery with exponential backoff
          let retryCount = 0;
          const maxRetries = 3;
          const retryDelay = 100;

          const attemptRecovery = () => {
            setTimeout(
              () => {
                retryCount++;

                try {
                  terminal.open(element);
                  fitAddon.fit();
                  logger.info(`Terminal [${id}] recovered after ${retryCount} attempts`);

                  // Update diagnostics on recovery
                  import('~/utils/shell')
                    .then(({ terminalDiagnostics }) => {
                      const current = terminalDiagnostics.get();
                      terminalDiagnostics.set({
                        ...current,
                        status: 'healthy',
                        lastError: undefined,
                      });
                    })
                    .catch(() => {});

                  onTerminalReady?.(terminal);
                } catch (retryError) {
                  logger.error(`Terminal recovery attempt ${retryCount} failed [${id}]:`, retryError);

                  if (retryCount < maxRetries) {
                    attemptRecovery();
                  } else {
                    logger.error(`Terminal [${id}] failed to recover after ${maxRetries} attempts`);

                    // Show error in terminal element
                    element.innerHTML = `
                    <div style="color: #ef4444; padding: 10px; font-family: monospace; font-size: 12px;">
                      ⚠️ Terminal failed to initialize<br>
                      <span style="color: #9ca3af;">Click the reset button to try again</span>
                    </div>
                  `;
                  }
                }
              },
              retryDelay * Math.pow(2, retryCount),
            );
          };

          attemptRecovery();
        }

        const resizeObserver = new ResizeObserver((entries) => {
          // Debounce resize events
          if (entries.length > 0) {
            try {
              fitAddon.fit();
              onTerminalResize?.(terminal.cols, terminal.rows);
            } catch (error) {
              logger.error(`Resize error [${id}]:`, error);
            }
          }
        });

        resizeObserverRef.current = resizeObserver;
        resizeObserver.observe(element);

        logger.debug(`Attach [${id}]`);

        onTerminalReady?.(terminal);

        return () => {
          try {
            resizeObserver.disconnect();
            terminal.dispose();
          } catch (error) {
            logger.error(`Cleanup error [${id}]:`, error);
          }
        };
      }, []);

      useEffect(() => {
        const terminal = terminalRef.current!;

        // we render a transparent cursor in case the terminal is readonly
        terminal.options.theme = getTerminalTheme(readonly ? { cursor: '#00000000' } : {});

        terminal.options.disableStdin = readonly;
      }, [theme, readonly]);

      useImperativeHandle(ref, () => {
        return {
          reloadStyles: () => {
            const terminal = terminalRef.current;

            if (terminal) {
              terminal.options.theme = getTerminalTheme(readonly ? { cursor: '#00000000' } : {});
            }
          },
          getTerminal: () => {
            return terminalRef.current;
          },
        };
      }, [readonly]);

      return <div className={className} ref={terminalElementRef} />;
    },
  ),
);
