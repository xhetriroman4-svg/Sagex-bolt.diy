import type { WebContainer } from '@webcontainer/api';
import { path as nodePath } from '~/utils/path';
import { atom, map, type MapStore } from 'nanostores';
import type { ActionAlert, BoltAction, DeployAlert, FileHistory, SupabaseAction, SupabaseAlert } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import type { BoltShell } from '~/utils/shell';

const logger = createScopedLogger('ActionRunner');

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export type BaseActionState = BoltAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
};

export type FailedActionState = BoltAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

class ActionCommandError extends Error {
  readonly _output: string;
  readonly _header: string;
  readonly _suggestions: string[];
  readonly _isRecoverable: boolean;

  constructor(message: string, output: string, suggestions: string[] = [], isRecoverable: boolean = false) {
    // Create a formatted message that includes both the error message and output
    const formattedMessage = `Failed To Execute Shell Command: ${message}\n\nOutput:\n${output}`;
    super(formattedMessage);

    // Set the output separately so it can be accessed programmatically
    this._header = message;
    this._output = output;
    this._suggestions = suggestions;
    this._isRecoverable = isRecoverable;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, ActionCommandError.prototype);

    // Set the name of the error for better debugging
    this.name = 'ActionCommandError';
  }

  // Optional: Add a method to get just the terminal output
  get output() {
    return this._output;
  }
  get header() {
    return this._header;
  }
  get suggestions() {
    return this._suggestions;
  }
  get isRecoverable() {
    return this._isRecoverable;
  }
}

export class ActionRunner {
  #webcontainer: Promise<WebContainer>;
  #currentExecutionPromise: Promise<void> = Promise.resolve();
  #shellTerminal: () => BoltShell;
  runnerId = atom<string>(`${Date.now()}`);
  actions: ActionsMap = map({});
  onAlert?: (alert: ActionAlert) => void;
  onSupabaseAlert?: (alert: SupabaseAlert) => void;
  onDeployAlert?: (alert: DeployAlert) => void;
  buildOutput?: { path: string; exitCode: number; output: string };

  constructor(
    webcontainerPromise: Promise<WebContainer>,
    getShellTerminal: () => BoltShell,
    onAlert?: (alert: ActionAlert) => void,
    onSupabaseAlert?: (alert: SupabaseAlert) => void,
    onDeployAlert?: (alert: DeployAlert) => void,
  ) {
    this.#webcontainer = webcontainerPromise;
    this.#shellTerminal = getShellTerminal;
    this.onAlert = onAlert;
    this.onSupabaseAlert = onSupabaseAlert;
    this.onDeployAlert = onDeployAlert;
  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
      // action already added
      return;
    }

    const abortController = new AbortController();

    this.actions.setKey(actionId, {
      ...data.action,
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(actionId, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });

    this.#currentExecutionPromise.then(() => {
      this.#updateAction(actionId, { status: 'running' });
    });
  }

  async runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const { actionId } = data;
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      return; // No return value here
    }

    if (isStreaming && action.type !== 'file') {
      return; // No return value here
    }

    this.#updateAction(actionId, { ...action, ...data.action, executed: !isStreaming });

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        return this.#executeAction(actionId, isStreaming);
      })
      .catch((error) => {
        logger.error('Action execution promise failed:', error);
      });

    await this.#currentExecutionPromise;

    return;
  }

  async #executeAction(actionId: string, isStreaming: boolean = false) {
    const action = this.actions.get()[actionId];

    this.#updateAction(actionId, { status: 'running' });

    try {
      switch (action.type) {
        case 'shell': {
          await this.#runShellAction(action);
          break;
        }
        case 'file': {
          await this.#runFileAction(action);
          break;
        }
        case 'supabase': {
          try {
            await this.handleSupabaseAction(action as SupabaseAction);
          } catch (error: any) {
            // Update action status
            this.#updateAction(actionId, {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Supabase action failed',
            });

            // Return early without re-throwing
            return;
          }
          break;
        }
        case 'build': {
          const buildOutput = await this.#runBuildAction(action);

          // Store build output for deployment
          this.buildOutput = buildOutput;
          break;
        }
        case 'start': {
          // making the start app non blocking

          this.#runStartAction(action)
            .then(() => this.#updateAction(actionId, { status: 'complete' }))
            .catch((err: Error) => {
              if (action.abortSignal.aborted) {
                return;
              }

              this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });
              logger.error(`[${action.type}]:Action failed\n\n`, err);

              if (!(err instanceof ActionCommandError)) {
                return;
              }

              this.onAlert?.({
                type: 'error',
                title: 'Dev Server Failed',
                description: err.header,
                content: err.output,
                source: 'terminal',
                suggestions: err.suggestions,
                isRecoverable: err.isRecoverable,
                command: action.content,
              });
            });

          /*
           * Reduced delay to avoid race condition between start actions
           * Using shorter delay with event-based readiness check
           */
          await new Promise((resolve) => setTimeout(resolve, 500));

          return;
        }
      }

      this.#updateAction(actionId, {
        status: isStreaming ? 'running' : action.abortSignal.aborted ? 'aborted' : 'complete',
      });
    } catch (error) {
      if (action.abortSignal.aborted) {
        return;
      }

      this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });
      logger.error(`[${action.type}]:Action failed\n\n`, error);

      if (!(error instanceof ActionCommandError)) {
        return;
      }

      this.onAlert?.({
        type: 'error',
        title: 'Dev Server Failed',
        description: error.header,
        content: error.output,
        source: 'terminal',
        suggestions: error.suggestions,
        isRecoverable: error.isRecoverable,
      });

      // re-throw the error to be caught in the promise chain
      throw error;
    }
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const shell = this.#shellTerminal();
    await shell.ready();

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }

    // Pre-validate command for common issues
    const validationResult = await this.#validateShellCommand(action.content);

    if (validationResult.shouldModify && validationResult.modifiedCommand) {
      logger.debug(`Modified command: ${action.content} -> ${validationResult.modifiedCommand}`);
      action.content = validationResult.modifiedCommand;
    }

    const resp = await shell.executeCommand(this.runnerId.get(), action.content, () => {
      logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
      action.abort();
    });
    logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

    if (resp?.exitCode != 0) {
      const enhancedError = this.#createEnhancedShellError(action.content, resp?.exitCode, resp?.output);
      throw new ActionCommandError(enhancedError.title, enhancedError.details);
    }
  }

  async #runStartAction(action: ActionState) {
    if (action.type !== 'start') {
      unreachable('Expected shell action');
    }

    if (!this.#shellTerminal) {
      unreachable('Shell terminal not found');
    }

    const shell = this.#shellTerminal();
    await shell.ready();

    if (!shell || !shell.terminal || !shell.process) {
      // Try to restart the shell
      logger.warn('Shell not ready, attempting restart...');

      // Give it a moment and try again
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!shell || !shell.terminal || !shell.process) {
        unreachable('Shell terminal not found after restart attempt');
      }
    }

    const resp = await shell.executeCommand(this.runnerId.get(), action.content, () => {
      logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
      action.abort();
    });
    logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

    if (resp?.exitCode != 0) {
      const suggestions = this.#getFixSuggestions(action.content, resp?.output || '');
      const error = new ActionCommandError(
        'Failed To Start Application',
        resp?.output || 'No Output Available',
        suggestions,
        true, // This is often recoverable
      );
      throw error;
    }

    return resp;
  }

  /**
   * Generate fix suggestions based on command and error output
   */
  #getFixSuggestions(command: string, output: string): string[] {
    const suggestions: string[] = [];

    // Check for common issues
    if (output.includes('EADDRINUSE') || (output.includes('Port') && output.includes('already in use'))) {
      suggestions.push('A port is already in use. Try killing the process using that port or use a different port.');
      suggestions.push('Run: `lsof -i :PORT` to find the process, then kill it.');
    }

    if (output.includes('ENOENT') || output.includes('no such file')) {
      suggestions.push('A required file or directory is missing.');
      suggestions.push('Check if all dependencies are installed: `npm install`');
    }

    if (output.includes('MODULE_NOT_FOUND')) {
      suggestions.push('A required module is not installed.');
      suggestions.push('Install missing dependencies: `npm install`');
    }

    if (output.includes('SyntaxError')) {
      suggestions.push('There is a syntax error in your code.');
      suggestions.push('Check the file mentioned in the error and fix the syntax error.');
    }

    if (output.includes('TypeError')) {
      suggestions.push('There is a type error in your code.');
      suggestions.push('Check the variables and functions mentioned in the error.');
    }

    if (command.includes('npm run') || command.includes('yarn') || command.includes('pnpm')) {
      if (output.includes('missing script')) {
        suggestions.push('The script is not defined in package.json.');
        suggestions.push('Add the script to package.json under "scripts" section.');
      }
    }

    if (output.includes('permission denied')) {
      suggestions.push('Permission denied. Try running with appropriate permissions.');
    }

    if (output.includes('network') || output.includes('ECONNREFUSED') || output.includes('ETIMEDOUT')) {
      suggestions.push('Network error. Check your internet connection.');
      suggestions.push('If using a proxy, ensure it is configured correctly.');
    }

    // Generic fallback
    if (suggestions.length === 0) {
      suggestions.push('Check the error message above for specific details.');
      suggestions.push('Try running the command manually in the terminal to debug.');
      suggestions.push('Share this error with Bolt for more specific help.');
    }

    return suggestions;
  }

  async #runFileAction(action: ActionState) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    const webcontainer = await this.#webcontainer;
    const relativePath = nodePath.relative(webcontainer.workdir, action.filePath);

    let folder = nodePath.dirname(relativePath);

    // remove trailing slashes
    folder = folder.replace(/\/+$/g, '');

    if (folder !== '.') {
      try {
        await webcontainer.fs.mkdir(folder, { recursive: true });
        logger.debug('Created folder', folder);
      } catch (error) {
        logger.error('Failed to create folder\n\n', error);
      }
    }

    try {
      await webcontainer.fs.writeFile(relativePath, action.content);
      logger.debug(`File written ${relativePath}`);
    } catch (error) {
      logger.error('Failed to write file\n\n', error);
    }
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }

  async getFileHistory(filePath: string): Promise<FileHistory | null> {
    try {
      const webcontainer = await this.#webcontainer;
      const historyPath = this.#getHistoryPath(filePath);
      const content = await webcontainer.fs.readFile(historyPath, 'utf-8');

      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to get file history:', error);
      return null;
    }
  }

  async saveFileHistory(filePath: string, history: FileHistory) {
    // const webcontainer = await this.#webcontainer;
    const historyPath = this.#getHistoryPath(filePath);

    await this.#runFileAction({
      type: 'file',
      filePath: historyPath,
      content: JSON.stringify(history),
      changeSource: 'auto-save',
    } as any);
  }

  #getHistoryPath(filePath: string) {
    return nodePath.join('.history', filePath);
  }

  async #runBuildAction(action: ActionState) {
    if (action.type !== 'build') {
      unreachable('Expected build action');
    }

    // Trigger build started alert
    this.onDeployAlert?.({
      type: 'info',
      title: 'Building Application',
      description: 'Building your application...',
      stage: 'building',
      buildStatus: 'running',
      deployStatus: 'pending',
      source: 'netlify',
    });

    const webcontainer = await this.#webcontainer;

    // Create a new terminal specifically for the build
    const buildProcess = await webcontainer.spawn('npm', ['run', 'build']);

    let output = '';
    const outputPromise = buildProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          output += data;
        },
      }),
    );

    const exitCode = await buildProcess.exit;
    await outputPromise.catch(() => {
      // Ignore output piping errors; we still have whatever was captured
    });

    let buildDir = '';

    if (exitCode !== 0) {
      const buildResult = {
        path: buildDir,
        exitCode,
        output,
      };

      this.buildOutput = buildResult;

      // Trigger build failed alert
      this.onDeployAlert?.({
        type: 'error',
        title: 'Build Failed',
        description: 'Your application build failed',
        content: output || 'No build output available',
        stage: 'building',
        buildStatus: 'failed',
        deployStatus: 'pending',
        source: 'netlify',
      });

      throw new ActionCommandError('Build Failed', output || 'No Output Available');
    }

    // Trigger build success alert
    this.onDeployAlert?.({
      type: 'success',
      title: 'Build Completed',
      description: 'Your application was built successfully',
      stage: 'deploying',
      buildStatus: 'complete',
      deployStatus: 'running',
      source: 'netlify',
    });

    // Check for common build directories
    const commonBuildDirs = ['dist', 'build', 'out', 'output', '.next', 'public'];

    // Try to find the first existing build directory
    for (const dir of commonBuildDirs) {
      const dirPath = nodePath.join(webcontainer.workdir, dir);

      try {
        await webcontainer.fs.readdir(dirPath);
        buildDir = dirPath;
        break;
      } catch {
        continue;
      }
    }

    // If no build directory was found, use the default (dist)
    if (!buildDir) {
      buildDir = nodePath.join(webcontainer.workdir, 'dist');
    }

    const buildResult = {
      path: buildDir,
      exitCode,
      output,
    };

    this.buildOutput = buildResult;

    return buildResult;
  }
  async handleSupabaseAction(action: SupabaseAction) {
    const { operation, content, filePath } = action;
    logger.debug('[Supabase Action]:', { operation, filePath, content });

    switch (operation) {
      case 'migration':
        if (!filePath) {
          throw new Error('Migration requires a filePath');
        }

        // Show alert for migration action
        this.onSupabaseAlert?.({
          type: 'info',
          title: 'Supabase Migration',
          description: `Create migration file: ${filePath}`,
          content,
          source: 'supabase',
        });

        // Only create the migration file
        await this.#runFileAction({
          type: 'file',
          filePath,
          content,
          changeSource: 'supabase',
        } as any);
        return { success: true };

      case 'query': {
        // Always show the alert and let the SupabaseAlert component handle connection state
        this.onSupabaseAlert?.({
          type: 'info',
          title: 'Supabase Query',
          description: 'Execute database query',
          content,
          source: 'supabase',
        });

        // The actual execution will be triggered from SupabaseChatAlert
        return { pending: true };
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  // Add this method declaration to the class
  handleDeployAction(
    stage: 'building' | 'deploying' | 'complete',
    status: ActionStatus,
    details?: {
      url?: string;
      error?: string;
      source?: 'netlify' | 'vercel' | 'github' | 'gitlab';
    },
  ): void {
    if (!this.onDeployAlert) {
      logger.debug('No deploy alert handler registered');
      return;
    }

    const alertType = status === 'failed' ? 'error' : status === 'complete' ? 'success' : 'info';

    const title =
      stage === 'building'
        ? 'Building Application'
        : stage === 'deploying'
          ? 'Deploying Application'
          : 'Deployment Complete';

    const description =
      status === 'failed'
        ? `${stage === 'building' ? 'Build' : 'Deployment'} failed`
        : status === 'running'
          ? `${stage === 'building' ? 'Building' : 'Deploying'} your application...`
          : status === 'complete'
            ? `${stage === 'building' ? 'Build' : 'Deployment'} completed successfully`
            : `Preparing to ${stage === 'building' ? 'build' : 'deploy'} your application`;

    const buildStatus =
      stage === 'building' ? status : stage === 'deploying' || stage === 'complete' ? 'complete' : 'pending';

    const deployStatus = stage === 'building' ? 'pending' : status;

    this.onDeployAlert({
      type: alertType,
      title,
      description,
      content: details?.error || '',
      url: details?.url,
      stage,
      buildStatus: buildStatus as any,
      deployStatus: deployStatus as any,
      source: details?.source || 'netlify',
    });
  }

  async #validateShellCommand(command: string): Promise<{
    shouldModify: boolean;
    modifiedCommand?: string;
    warning?: string;
  }> {
    const trimmedCommand = command.trim();

    // Handle interactive npm/npx commands that need --yes flags
    const interactivePatterns = [
      // npm create commands (e.g., npm create vite)
      {
        pattern: /^npm\s+create\s+([^\s]+)(.*)$/,
        modify: (match: RegExpMatchArray) => `npm create ${match[1]} -- --yes${match[2] || ''}`,
        warning: 'Added --yes flag to npm create command for non-interactive mode',
      },

      // npx create-* commands without --yes
      {
        pattern: /^npx\s+(create-[^\s]+)(.*)$/,
        modify: (match: RegExpMatchArray) => `npx --yes ${match[1]} --yes${match[2] || ''}`,
        warning: 'Added --yes flags to npx create command for non-interactive mode',
      },

      // npm install without --yes
      {
        pattern: /^npm\s+(i|install|add)(\s+[^\s]+)*$/,
        modify: (match: RegExpMatchArray) => `${match[0]} --yes --no-audit --no-fund`,
        warning: 'Added --yes flag to npm install for non-interactive mode',
      },

      // pnpm create commands
      {
        pattern: /^pnpm\s+create\s+([^\s]+)(.*)$/,
        modify: (match: RegExpMatchArray) => `pnpm create ${match[1]} --yes${match[2] || ''}`,
        warning: 'Added --yes flag to pnpm create for non-interactive mode',
      },

      // yarn create commands
      {
        pattern: /^yarn\s+create\s+([^\s]+)(.*)$/,
        modify: (match: RegExpMatchArray) => `yarn create ${match[1]} --yes${match[2] || ''}`,
        warning: 'Added --yes flag to yarn create for non-interactive mode',
      },
    ];

    for (const { pattern, modify, warning } of interactivePatterns) {
      const match = trimmedCommand.match(pattern);

      if (match) {
        const modifiedCommand = modify(match);

        if (modifiedCommand !== trimmedCommand) {
          return {
            shouldModify: true,
            modifiedCommand,
            warning,
          };
        }
      }
    }

    // Handle rm commands that might fail due to missing files
    if (trimmedCommand.startsWith('rm ') && !trimmedCommand.includes(' -f')) {
      const rmMatch = trimmedCommand.match(/^rm\s+(.+)$/);

      if (rmMatch) {
        const filePaths = rmMatch[1].split(/\s+/);

        // Check if any of the files exist using WebContainer
        try {
          const webcontainer = await this.#webcontainer;
          const existingFiles = [];

          for (const filePath of filePaths) {
            if (filePath.startsWith('-')) {
              continue;
            } // Skip flags

            try {
              await webcontainer.fs.readFile(filePath);
              existingFiles.push(filePath);
            } catch {
              // File doesn't exist, skip it
            }
          }

          if (existingFiles.length === 0) {
            // No files exist, modify command to use -f flag to avoid error
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: 'Added -f flag to rm command as target files do not exist',
            };
          } else if (existingFiles.length < filePaths.length) {
            // Some files don't exist, modify to only remove existing ones with -f for safety
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: 'Added -f flag to rm command as some target files do not exist',
            };
          }
        } catch (error) {
          logger.debug('Could not validate rm command files:', error);
        }
      }
    }

    // Handle cd commands to non-existent directories
    if (trimmedCommand.startsWith('cd ')) {
      const cdMatch = trimmedCommand.match(/^cd\s+(.+)$/);

      if (cdMatch) {
        const targetDir = cdMatch[1].trim();

        try {
          const webcontainer = await this.#webcontainer;
          await webcontainer.fs.readdir(targetDir);
        } catch {
          return {
            shouldModify: true,
            modifiedCommand: `mkdir -p ${targetDir} && cd ${targetDir}`,
            warning: 'Directory does not exist, created it first',
          };
        }
      }
    }

    // Handle cp/mv commands with missing source files
    if (trimmedCommand.match(/^(cp|mv)\s+/)) {
      const parts = trimmedCommand.split(/\s+/);

      if (parts.length >= 3) {
        const sourceFile = parts[1];

        try {
          const webcontainer = await this.#webcontainer;
          await webcontainer.fs.readFile(sourceFile);
        } catch {
          return {
            shouldModify: false,
            warning: `Source file '${sourceFile}' does not exist`,
          };
        }
      }
    }

    return { shouldModify: false };
  }

  #createEnhancedShellError(
    command: string,
    exitCode: number | undefined,
    output: string | undefined,
  ): {
    title: string;
    details: string;
  } {
    const trimmedCommand = command.trim();
    const firstWord = trimmedCommand.split(/\s+/)[0];

    // Common error patterns and their explanations
    const errorPatterns = [
      {
        pattern: /cannot remove.*No such file or directory/,
        title: 'File Not Found',
        getMessage: () => {
          const fileMatch = output?.match(/'([^']+)'/);
          const fileName = fileMatch ? fileMatch[1] : 'file';

          return `The file '${fileName}' does not exist and cannot be removed.\n\nSuggestion: Use 'ls' to check what files exist, or use 'rm -f' to ignore missing files.`;
        },
      },
      {
        pattern: /No such file or directory/,
        title: 'File or Directory Not Found',
        getMessage: () => {
          if (trimmedCommand.startsWith('cd ')) {
            const dirMatch = trimmedCommand.match(/cd\s+(.+)/);
            const dirName = dirMatch ? dirMatch[1] : 'directory';

            return `The directory '${dirName}' does not exist.\n\nSuggestion: Use 'mkdir -p ${dirName}' to create it first, or check available directories with 'ls'.`;
          }

          return `The specified file or directory does not exist.\n\nSuggestion: Check the path and use 'ls' to see available files.`;
        },
      },
      {
        pattern: /Permission denied/,
        title: 'Permission Denied',
        getMessage: () =>
          `Permission denied for '${firstWord}'.\n\nSuggestion: The file may not be executable. Try 'chmod +x filename' first.`,
      },
      {
        pattern: /command not found/,
        title: 'Command Not Found',
        getMessage: () =>
          `The command '${firstWord}' is not available in WebContainer.\n\nSuggestion: Check available commands or use a package manager to install it.`,
      },
      {
        pattern: /Is a directory/,
        title: 'Target is a Directory',
        getMessage: () =>
          `Cannot perform this operation - target is a directory.\n\nSuggestion: Use 'ls' to list directory contents or add appropriate flags.`,
      },
      {
        pattern: /File exists/,
        title: 'File Already Exists',
        getMessage: () => `File already exists.\n\nSuggestion: Use a different name or add '-f' flag to overwrite.`,
      },
      {
        pattern: /Need to install the following packages|Ok to proceed\?/i,
        title: 'Interactive Prompt Required',
        getMessage: () =>
          `This command requires interactive confirmation.\n\nSuggestion: The command has been automatically modified to use --yes flags. Try running it again.`,
      },
      {
        pattern: /npm ERR!.*EACCES/i,
        title: 'Permission Error (EACCES)',
        getMessage: () =>
          `npm does not have permission to write to the required directory.\n\nSuggestion: Try using a different package manager or check folder permissions.`,
      },
      {
        pattern: /npm ERR!.*404/i,
        title: 'Package Not Found (404)',
        getMessage: () =>
          `The requested package was not found in the npm registry.\n\nSuggestion: Check the package name spelling or verify it exists on npmjs.com.`,
      },
      {
        pattern: /npm ERR!.*ERESOLVE/i,
        title: 'Dependency Resolution Error',
        getMessage: () =>
          `npm could not resolve dependencies due to version conflicts.\n\nSuggestion: Try running with --legacy-peer-deps or --force flags.`,
      },
      {
        pattern: /network|ETIMEDOUT|ENOTFOUND/i,
        title: 'Network Error',
        getMessage: () =>
          `A network error occurred while trying to fetch packages or resources.\n\nSuggestion: Check your internet connection or try again later.`,
      },
    ];

    // Try to match known error patterns
    for (const errorPattern of errorPatterns) {
      if (output && errorPattern.pattern.test(output)) {
        return {
          title: errorPattern.title,
          details: errorPattern.getMessage(),
        };
      }
    }

    // Generic error with suggestions based on command type
    let suggestion = '';

    if (trimmedCommand.startsWith('npm ')) {
      suggestion = '\n\nSuggestion: Try running "npm install" first or check package.json.';
    } else if (trimmedCommand.startsWith('git ')) {
      suggestion = "\n\nSuggestion: Check if you're in a git repository or if remote is configured.";
    } else if (trimmedCommand.match(/^(ls|cat|rm|cp|mv)/)) {
      suggestion = '\n\nSuggestion: Check file paths and use "ls" to see available files.';
    }

    return {
      title: `Command Failed (exit code: ${exitCode})`,
      details: `Command: ${trimmedCommand}\n\nOutput: ${output || 'No output available'}${suggestion}`,
    };
  }
}
