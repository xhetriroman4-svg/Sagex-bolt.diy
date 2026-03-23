import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import { newBoltShellProcess, newShellProcess, terminalDiagnostics } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TerminalStore');

export class TerminalStore {
  #webcontainer: Promise<WebContainer>;
  #terminals: Array<{ terminal: ITerminal; process: WebContainerProcess }> = [];
  #boltTerminal = newBoltShellProcess();

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(true);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
    }
  }
  get boltTerminal() {
    return this.#boltTerminal;
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }
  async attachBoltTerminal(terminal: ITerminal) {
    try {
      const wc = await this.#webcontainer;

      // Update diagnostics
      terminalDiagnostics.set({
        ...terminalDiagnostics.get(),
        webcontainerReady: true,
        status: 'initializing',
      });

      await this.#boltTerminal.init(wc, terminal);

      // Mark as healthy after successful init
      terminalDiagnostics.set({
        ...terminalDiagnostics.get(),
        status: 'healthy',
      });

      logger.info('Bolt terminal attached successfully');
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn bolt shell\n\n') + error.message);

      // Update diagnostics with error
      terminalDiagnostics.set({
        ...terminalDiagnostics.get(),
        status: 'error',
        lastError: error.message,
      });

      logger.error('Failed to attach bolt terminal:', error);

      return;
    }
  }

  async attachTerminal(terminal: ITerminal) {
    try {
      const shellProcess = await newShellProcess(await this.#webcontainer, terminal);
      this.#terminals.push({ terminal, process: shellProcess });
      logger.info('Additional terminal attached successfully');
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
      logger.error('Failed to attach terminal:', error);

      return;
    }
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { process } of this.#terminals) {
      process.resize({ cols, rows });
    }
  }

  async detachTerminal(terminal: ITerminal) {
    const terminalIndex = this.#terminals.findIndex((t) => t.terminal === terminal);

    if (terminalIndex !== -1) {
      const { process } = this.#terminals[terminalIndex];

      try {
        process.kill();
      } catch (error) {
        console.warn('Failed to kill terminal process:', error);
      }
      this.#terminals.splice(terminalIndex, 1);
    }
  }
}
