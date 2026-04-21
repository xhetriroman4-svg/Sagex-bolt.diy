/**
 * Intelligent Terminal Executor
 *
 * This module provides AI-like terminal capabilities similar to how I use my Bash tool:
 * - Command validation and pre-flight checks
 * - Automatic error analysis and fix suggestions
 * - Smart retry with modified commands
 * - Dependency auto-installation
 * - Working directory management
 * - Environment setup
 */

import type { WebContainer } from '@webcontainer/api';
import type { BoltShell, ExecutionResult } from '~/utils/shell';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('IntelligentExecutor');

// Command execution context
export interface ExecutionContext {
  webcontainer: WebContainer;
  shell: BoltShell;
  sessionId: string;
  workingDirectory?: string;
  env?: Record<string, string>;
  timeout?: number;
  retryCount?: number;
  autoFix?: boolean;
}

// Command analysis result
export interface CommandAnalysis {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  requiresDependencies: string[];
  requiresNetwork: boolean;
  requiresBuild: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

// Error analysis result
export interface ErrorAnalysis {
  type: 'dependency' | 'permission' | 'network' | 'syntax' | 'resource' | 'unknown';
  message: string;
  fixCommand?: string;
  fixDescription?: string;
  canAutoFix: boolean;
  retryWithModification?: string;
}

// Common error patterns and their fixes
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  type: ErrorAnalysis['type'];
  getFix: (match: RegExpMatchArray, command: string, output: string) => ErrorAnalysis;
}> = [
  // npm package not found
  {
    pattern: /npm ERR! 404 Not Found - GET https?:\/\/registry\.npmjs\.org\/([^\s]+)/,
    type: 'dependency',
    getFix: (match) => ({
      type: 'dependency',
      message: `Package not found: ${match[1]}`,
      fixCommand: undefined, // Can't fix - package doesn't exist
      fixDescription: 'The package does not exist in npm registry. Check the package name.',
      canAutoFix: false,
    }),
  },

  // Module not found
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/,
    type: 'dependency',
    getFix: (match) => ({
      type: 'dependency',
      message: `Module not found: ${match[1]}`,
      fixCommand: `npm install ${match[1]}`,
      fixDescription: `Install missing module: ${match[1]}`,
      canAutoFix: true,
    }),
  },

  // Command not found
  {
    pattern: /command not found:\s*(\S+)/i,
    type: 'dependency',
    getFix: (match) => ({
      type: 'dependency',
      message: `Command not found: ${match[1]}`,
      fixCommand: `npm install -g ${match[1]}`,
      fixDescription: `Install command globally: ${match[1]}`,
      canAutoFix: true,
    }),
  },

  // Permission denied
  {
    pattern: /Permission denied/i,
    type: 'permission',
    getFix: (_, command) => ({
      type: 'permission',
      message: 'Permission denied',
      fixCommand: command.includes('npm') ? 'npm install --unsafe-perm' : undefined,
      fixDescription: 'Try running with elevated permissions',
      canAutoFix: command.includes('npm'),
    }),
  },

  // Port already in use
  {
    pattern: /EADDRINUSE|Port (\d+) is already in use/i,
    type: 'resource',
    getFix: (match) => ({
      type: 'resource',
      message: `Port ${match[1] || 'is already in use'}`,
      fixDescription: 'Kill the process using that port or use a different port',
      canAutoFix: false,
    }),
  },

  // Network errors
  {
    pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network\s*(error|timeout)/i,
    type: 'network',
    getFix: () => ({
      type: 'network',
      message: 'Network error',
      fixDescription: 'Check your internet connection and try again',
      canAutoFix: false,
    }),
  },

  // Missing script
  {
    pattern: /Missing script:\s*"([^"]+)"/i,
    type: 'syntax',
    getFix: (match) => ({
      type: 'syntax',
      message: `Missing npm script: ${match[1]}`,
      fixDescription: `Add the script to package.json or use a different command`,
      canAutoFix: false,
    }),
  },

  // Syntax error in file
  {
    pattern: /SyntaxError:\s*(.+?)\s*at\s*(.+?):(\d+)/i,
    type: 'syntax',
    getFix: (match) => ({
      type: 'syntax',
      message: `Syntax error in ${match[2]}:${match[3]}`,
      fixDescription: `Fix syntax error: ${match[1]}`,
      canAutoFix: false,
    }),
  },

  // Out of memory
  {
    pattern: /JavaScript heap out of memory|FATAL ERROR.*heap/i,
    type: 'resource',
    getFix: () => ({
      type: 'resource',
      message: 'Out of memory',
      fixCommand: 'NODE_OPTIONS="--max-old-space-size=4096" npm run dev',
      fixDescription: 'Increase Node.js memory limit',
      canAutoFix: true,
    }),
  },

  // TypeScript errors
  {
    pattern: /error TS(\d+):\s*(.+)/i,
    type: 'syntax',
    getFix: (match) => ({
      type: 'syntax',
      message: `TypeScript error: ${match[2]}`,
      fixDescription: 'Fix the TypeScript error in your code',
      canAutoFix: false,
    }),
  },

  // File not found
  {
    pattern: /ENOENT:\s*no such file or directory,\s*(?:open|stat|access)\s*['"]?([^'"\s]+)['"]?/i,
    type: 'resource',
    getFix: (match) => ({
      type: 'resource',
      message: `File not found: ${match[1]}`,
      fixDescription: `Create the file or check the path: ${match[1]}`,
      canAutoFix: false,
    }),
  },

  // Lock file issues
  {
    pattern: /npm ERR!\s*(?:It is likely not a bug in npm|lockfile)/i,
    type: 'dependency',
    getFix: () => ({
      type: 'dependency',
      message: 'npm lock file issue',
      fixCommand: 'rm -rf node_modules package-lock.json && npm install',
      fixDescription: 'Clean install dependencies',
      canAutoFix: true,
    }),
  },

  // Peer dependency issues
  {
    pattern: /ERESOLVE.*Could not resolve dependency/i,
    type: 'dependency',
    getFix: () => ({
      type: 'dependency',
      message: 'Peer dependency conflict',
      fixCommand: 'npm install --legacy-peer-deps',
      fixDescription: 'Install with legacy peer deps resolution',
      canAutoFix: true,
    }),
  },
];

export function analyzeCommand(command: string, _context?: ExecutionContext): CommandAnalysis {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const requiresDependencies: string[] = [];
  let requiresNetwork = false;
  let requiresBuild = false;
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  // Check for network-requiring commands
  if (/npm\s+(install|i|add|update)|npx\s|yarn\s|pnpm\s|git\s+(clone|pull|push|fetch)/i.test(command)) {
    requiresNetwork = true;
  }

  // Check for build commands
  if (/npm\s+run\s+(build|compile|bundle)|tsc|webpack|vite\s+build/i.test(command)) {
    requiresBuild = true;
  }

  // Check for dangerous commands
  if (/rm\s+-rf\s+\/|rm\s+-rf\s+~|:\(\)\{\s*:\|:\s*&\s*\};\s*:|mkfs|dd\s+if=/i.test(command)) {
    riskLevel = 'high';
    issues.push('Dangerous command detected');
    suggestions.push('This command could cause data loss. Please verify before running.');
  }

  // Check for package installation
  const npmInstallMatch = command.match(/npm\s+(?:i|install|add)\s+(?:-g\s+)?(.+)/i);

  if (npmInstallMatch) {
    const packages = npmInstallMatch[1].split(/\s+/).filter((p) => !p.startsWith('-'));
    requiresDependencies.push(...packages);
  }

  // Check for missing --yes flag in npm create
  if (/npm\s+create\s+\S+(?!\s+--)\s*$/i.test(command)) {
    issues.push('npm create command may require --yes flag for non-interactive mode');
    suggestions.push('Add -- --yes to make it non-interactive');
  }

  // Check for missing --yes flag in npx
  if (/^npx\s+(?!--yes\s)\S+/.test(command)) {
    issues.push('npx command may require --yes flag for non-interactive mode');
    suggestions.push('Add --yes before the package name');
  }

  // Check for cd to non-existent directory (we can't verify this without executing)
  const cdMatch = command.match(/cd\s+(\S+)/);

  if (cdMatch && !cdMatch[1].startsWith('$')) {
    suggestions.push(`Ensure directory '${cdMatch[1]}' exists before cd`);
  }

  // Check for package.json dependency
  if (/npm\s+run/i.test(command)) {
    suggestions.push('Ensure package.json has the required script defined');
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
    requiresDependencies,
    requiresNetwork,
    requiresBuild,
    riskLevel,
  };
}

/**
 * Analyze command output for errors
 */
export function analyzeError(command: string, output: string, exitCode: number): ErrorAnalysis {
  if (exitCode === 0) {
    return {
      type: 'unknown',
      message: 'No error',
      canAutoFix: false,
    };
  }

  // Try to match known error patterns
  for (const { pattern, getFix } of ERROR_PATTERNS) {
    const match = output.match(pattern);

    if (match) {
      return getFix(match, command, output);
    }
  }

  // Generic error analysis
  const lines = output.split('\n').filter(Boolean);
  const errorLine = lines.find((l) => /error|failed|cannot|cannot|fatal/i.test(l)) || lines[0];

  return {
    type: 'unknown',
    message: errorLine?.substring(0, 200) || 'Unknown error',
    fixDescription: 'Check the error message and fix the issue manually',
    canAutoFix: false,
  };
}

/**
 * Generate a modified command to fix an error
 */
export function generateFixCommand(command: string, error: ErrorAnalysis): string | null {
  if (error.fixCommand) {
    return error.fixCommand;
  }

  // Try to generate fix based on command type
  if (command.includes('npm install') || command.includes('npm i')) {
    // Add common flags for npm install issues
    if (error.type === 'network') {
      return `${command} --prefer-offline`;
    }

    if (error.type === 'permission') {
      return `${command} --unsafe-perm`;
    }
  }

  if (command.includes('npm run') && error.message.includes('Missing script')) {
    return null; // Can't fix missing scripts automatically
  }

  if (command.includes('node') && error.message.includes('heap')) {
    return `NODE_OPTIONS="--max-old-space-size=4096" ${command}`;
  }

  return null;
}

/**
 * Pre-flight checks and setup for command execution
 */
export async function prepareCommand(
  command: string,
  context: ExecutionContext,
): Promise<{ ready: boolean; setupCommands: string[]; issues: string[] }> {
  const setupCommands: string[] = [];
  const issues: string[] = [];

  // Check if package.json exists and is valid for npm commands
  if (/npm\s+(install|i|run|test|build)/i.test(command)) {
    try {
      const files = context.webcontainer.fs.readdir('.');
      const hasPackageJson = (await files).includes('package.json');

      if (!hasPackageJson && !command.includes('init')) {
        // Create minimal package.json
        setupCommands.push('echo \'{"name": "project", "version": "1.0.0"}\' > package.json');
      }
    } catch (e) {
      logger.warn('Failed to check for package.json:', e);
    }
  }

  // Check for node_modules before running npm run
  if (/npm\s+run/i.test(command)) {
    try {
      const files = context.webcontainer.fs.readdir('.');
      const hasNodeModules = (await files).includes('node_modules');

      if (!hasNodeModules) {
        setupCommands.push('npm install');
      }
    } catch (e) {
      logger.warn('Failed to check for node_modules:', e);
    }
  }

  return {
    ready: issues.length === 0,
    setupCommands,
    issues,
  };
}

/**
 * Execute a command with intelligent error handling
 */
export async function executeIntelligent(
  command: string,
  context: ExecutionContext,
): Promise<{
  result: ExecutionResult;
  analysis?: ErrorAnalysis;
  fixApplied?: boolean;
  fixCommand?: string;
}> {
  let currentCommand = command;
  let attempts = 0;
  const maxAttempts = 3;
  let lastError: ErrorAnalysis | undefined;
  let fixApplied = false;
  let fixCommand: string | undefined;

  while (attempts < maxAttempts) {
    attempts++;

    // Pre-flight checks
    const preparation = await prepareCommand(currentCommand, context);

    // Run setup commands first
    for (const setupCmd of preparation.setupCommands) {
      logger.info(`Running setup: ${setupCmd}`);
      await context.shell.executeCommand(context.sessionId, setupCmd);
    }

    // Execute the main command
    const result = await context.shell.executeCommand(context.sessionId, currentCommand);

    if (!result) {
      return {
        result: { output: 'No result from command execution', exitCode: -1 },
        analysis: { type: 'unknown', message: 'No result', canAutoFix: false },
      };
    }

    // Check if successful
    if (result.exitCode === 0) {
      return { result, fixApplied, fixCommand };
    }

    // Analyze the error
    lastError = analyzeError(currentCommand, result.output || '', result.exitCode);
    logger.warn(`Command failed (attempt ${attempts}/${maxAttempts}):`, lastError);

    // Try to auto-fix
    if (context.autoFix !== false && lastError.canAutoFix) {
      const suggestedFix = generateFixCommand(currentCommand, lastError);

      if (suggestedFix) {
        logger.info(`Auto-fixing with: ${suggestedFix}`);
        fixCommand = suggestedFix;
        fixApplied = true;

        // Run the fix command first if it's different from current command
        if (suggestedFix !== currentCommand) {
          const fixResult = await context.shell.executeCommand(context.sessionId, suggestedFix);

          if (fixResult?.exitCode === 0) {
            // Fix succeeded, retry original command
            currentCommand = command;
            continue;
          }
        } else {
          // The fix is the modified command itself
          currentCommand = suggestedFix;
          continue;
        }
      }

      // Try retry with modification
      if (lastError.retryWithModification) {
        currentCommand = lastError.retryWithModification;
        continue;
      }
    }

    // No auto-fix available, return error
    return {
      result,
      analysis: lastError,
      fixApplied,
      fixCommand,
    };
  }

  // All attempts failed
  return {
    result: {
      output: `Command failed after ${maxAttempts} attempts. Last error: ${lastError?.message || 'Unknown'}`,
      exitCode: 1,
    },
    analysis: lastError,
    fixApplied,
    fixCommand,
  };
}

/**
 * Get fix suggestions for an error (for Ask Bolt feature)
 */
export function getFixSuggestions(command: string, output: string, exitCode: number): string[] {
  const analysis = analyzeError(command, output, exitCode);
  const suggestions: string[] = [];

  if (analysis.fixDescription) {
    suggestions.push(analysis.fixDescription);
  }

  if (analysis.fixCommand) {
    suggestions.push(`Run: \`${analysis.fixCommand}\``);
  }

  // Add contextual suggestions
  if (analysis.type === 'dependency') {
    suggestions.push('Try running `npm install` to install missing dependencies');
    suggestions.push('Check if the package name is spelled correctly');
  }

  if (analysis.type === 'network') {
    suggestions.push('Check your internet connection');
    suggestions.push('Try again in a few moments');
    suggestions.push('Use `--prefer-offline` flag if you have cached packages');
  }

  if (analysis.type === 'permission') {
    suggestions.push('Try running with `--unsafe-perm` flag for npm');
  }

  if (analysis.type === 'resource') {
    suggestions.push('Check if another process is using the required resource');
    suggestions.push('Try freeing up memory by closing other applications');
  }

  return suggestions;
}
