import { memo, useEffect, useRef } from 'react';
import type { Terminal as XTerm } from '@xterm/xterm';
import { createScopedLogger } from '~/utils/logger';
import { terminalDiagnostics } from '~/utils/shell';

const logger = createScopedLogger('TerminalManager');

interface TerminalManagerProps {
  terminal: XTerm | null;
  isActive: boolean;
  onReconnect?: () => void;
}

/**
 * TerminalManager handles:
 * - Clipboard paste operations (Ctrl+V / Cmd+V)
 * - Auto-focus when terminal becomes active
 * - Health monitoring and recovery
 * - Keyboard shortcuts for terminal operations
 */
export const TerminalManager = memo(({ terminal, isActive }: TerminalManagerProps) => {
  const lastHealthCheck = useRef<number>(Date.now());
  const consecutiveErrors = useRef<number>(0);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);

  // Set up paste handler and keyboard shortcuts
  useEffect(() => {
    if (!terminal) {
      return undefined;
    }

    const disposables: Array<{ dispose: () => void }> = [];

    // Set up paste handler via terminal's onKey
    const onPasteKeyDisposable = terminal.onKey((e) => {
      // Detect Ctrl+V or Cmd+V
      if ((e.domEvent.ctrlKey || e.domEvent.metaKey) && e.domEvent.key === 'v') {
        if (!isActive) {
          return;
        }

        // Read from clipboard if available
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard
            .readText()
            .then((text) => {
              if (text && terminal) {
                terminal.paste(text);
              }
            })
            .catch((err) => {
              logger.warn('Failed to read clipboard:', err);
            });
        }
      }

      // Ctrl+C to copy selected text
      if ((e.domEvent.ctrlKey || e.domEvent.metaKey) && e.domEvent.key === 'c' && terminal.hasSelection()) {
        const selection = terminal.getSelection();

        if (selection && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(selection)
            .then(() => {
              logger.debug('Copied selection to clipboard');
            })
            .catch((err) => {
              logger.warn('Failed to write to clipboard:', err);
            });
        }
      }

      // Ctrl+L to clear screen (common terminal shortcut)
      if ((e.domEvent.ctrlKey || e.domEvent.metaKey) && e.domEvent.key === 'l') {
        e.domEvent.preventDefault();
        terminal.clear();
      }

      // Ctrl+K to clear line from cursor to end
      if ((e.domEvent.ctrlKey || e.domEvent.metaKey) && e.domEvent.key === 'k') {
        e.domEvent.preventDefault();

        // This is handled by the shell, but we can emit the sequence
        terminal.paste('\x1bK');
      }
    });

    disposables.push(onPasteKeyDisposable);

    // Set up selection change handler for copy indication
    const onSelectionDisposable = terminal.onSelectionChange(() => {
      if (terminal.hasSelection()) {
        // Could show a tooltip or visual indicator for copy
        logger.debug('Text selected');
      }
    });

    disposables.push(onSelectionDisposable);

    // Handle terminal resize
    const onDataDisposable = terminal.onData((data) => {
      // Reset error counter on successful input
      if (data && data !== '\x03') {
        // Not Ctrl+C
        consecutiveErrors.current = 0;
      }
    });

    disposables.push(onDataDisposable);

    return () => {
      disposables.forEach((d) => d.dispose());
    };
  }, [terminal, isActive]);

  // Auto-focus terminal when it becomes active
  useEffect(() => {
    if (isActive && terminal) {
      // Small delay to ensure DOM is ready
      const focusTimeout = setTimeout(() => {
        try {
          terminal.focus();
          logger.debug('Terminal focused');
        } catch (error) {
          logger.warn('Failed to focus terminal:', error);
        }
      }, 100);

      return () => clearTimeout(focusTimeout);
    }
  }, [isActive, terminal]);

  // Health monitoring - periodic check
  useEffect(() => {
    if (!terminal) {
      return undefined;
    }

    // Update diagnostics periodically
    heartbeatInterval.current = setInterval(() => {
      const now = Date.now();
      const timeSinceLastCheck = now - lastHealthCheck.current;

      // Check every 10 seconds
      if (timeSinceLastCheck > 10000) {
        lastHealthCheck.current = now;

        // Check if terminal is responsive
        try {
          // Simple responsiveness check
          const cols = terminal.cols;
          const rows = terminal.rows;

          if (cols > 0 && rows > 0) {
            // Terminal is responsive
            const currentDiagnostics = terminalDiagnostics.get();

            if (currentDiagnostics.status !== 'healthy') {
              terminalDiagnostics.set({
                ...currentDiagnostics,
                status: 'healthy',
              });
            }
          }
        } catch (error) {
          logger.warn('Terminal health check failed:', error);
          consecutiveErrors.current++;

          // Update diagnostics to error if multiple consecutive failures
          if (consecutiveErrors.current >= 3) {
            const currentDiagnostics = terminalDiagnostics.get();
            terminalDiagnostics.set({
              ...currentDiagnostics,
              status: 'error',
              lastError: 'Terminal unresponsive',
            });
          }
        }
      }
    }, 5000);

    return () => {
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
    };
  }, [terminal]);

  // Handle terminal errors
  useEffect(() => {
    if (!terminal) {
      return undefined;
    }

    // Listen for terminal errors
    const onErrorDisposable = terminal.onData((data) => {
      // Check for common error patterns in output
      const errorPatterns = [
        /error:/i,
        /failed:/i,
        /cannot/i,
        /permission denied/i,
        /no such file/i,
        /command not found/i,
      ];

      const hasError = errorPatterns.some((pattern) => pattern.test(data));

      if (hasError) {
        logger.debug('Potential error detected in terminal output');

        // Could trigger error analysis here
      }
    });

    return () => {
      onErrorDisposable.dispose();
    };
  }, [terminal]);

  return null; // This is a utility component, no UI
});

TerminalManager.displayName = 'TerminalManager';
