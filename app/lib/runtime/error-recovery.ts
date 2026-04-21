/**
 * Smart Error Recovery System
 *
 * Provides automatic error detection, circuit breaker pattern,
 * auto-fix feedback loop, and WebContainer health monitoring.
 */

import { atom, map, type MapStore } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import { analyzeError, generateFixCommand, type ErrorAnalysis } from './intelligent-executor';

const logger = createScopedLogger('ErrorRecovery');

// Circuit breaker states
export type CircuitState = 'closed' | 'open' | 'half-open';

// Error event record
export interface ErrorEvent {
  id: string;
  timestamp: number;
  type: string; // 'shell' | 'file' | 'webcontainer' | 'api' | 'build' | 'preview'
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: string;
  command?: string;
  filePath?: string;
  errorAnalysis?: ErrorAnalysis;
  autoFixAttempted: boolean;
  autoFixSucceeded: boolean;
  autoFixCommand?: string;
  resolved: boolean;
  resolvedAt?: number;
  resolution?: string;
}

// Circuit breaker config
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  halfOpenMaxAttempts: number;
}

// Recovery stats
export interface RecoveryStats {
  totalErrors: number;
  autoFixedErrors: number;
  manuallyResolvedErrors: number;
  unresolvedErrors: number;
  averageRecoveryTime: number;
}

// Stores
export const errorEvents: MapStore<Record<string, ErrorEvent>> = map({});
export const circuitState = atom<CircuitState>('closed');
export const recoveryStats = atom<RecoveryStats>({
  totalErrors: 0,
  autoFixedErrors: 0,
  manuallyResolvedErrors: 0,
  unresolvedErrors: 0,
  averageRecoveryTime: 0,
});
export const activeErrorAlert = atom<ErrorEvent | null>(null);
export const isAutoFixing = atom<boolean>(false);
export const webcontainerHealth = atom<'healthy' | 'degraded' | 'unhealthy' | 'unknown'>('unknown');

// Circuit breaker state per provider
export const providerCircuitStates: MapStore<Record<string, CircuitState>> = map({});

// Circuit breaker configs
const defaultCircuitConfig: CircuitBreakerConfig = {
  failureThreshold: 3,
  recoveryTimeout: 30000, // 30 seconds
  halfOpenMaxAttempts: 1,
};

const providerConfigs: Record<string, CircuitBreakerConfig> = {};

// Failure counters per provider
const failureCounts: Record<string, number> = {};
const circuitOpenAt: Record<string, number> = {};
const halfOpenAttempts: Record<string, number> = {};

// Auto-send error back to AI queue
export const pendingAutoFixQueue: MapStore<Record<string, ErrorEvent>> = map({});

/**
 * Record an error event
 */
export function recordError(params: {
  type: ErrorEvent['type'];
  severity: ErrorEvent['severity'];
  message: string;
  details?: string;
  command?: string;
  filePath?: string;
  output?: string;
  exitCode?: number;
}): ErrorEvent {
  const id = `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  let errorAnalysis: ErrorAnalysis | undefined;
  let autoFixCommand: string | undefined;

  // Analyze the error if we have command and output
  if (params.command && params.output) {
    errorAnalysis = analyzeError(params.command, params.output, params.exitCode || 1);
    autoFixCommand = generateFixCommand(params.command, errorAnalysis) ?? undefined;
  }

  const event: ErrorEvent = {
    id,
    timestamp: Date.now(),
    type: params.type,
    severity: params.severity,
    message: params.message,
    details: params.details,
    command: params.command,
    filePath: params.filePath,
    errorAnalysis,
    autoFixAttempted: false,
    autoFixSucceeded: false,
    autoFixCommand,
    resolved: false,
  };

  errorEvents.setKey(id, event);

  // Update stats
  const stats = recoveryStats.get();
  recoveryStats.set({
    ...stats,
    totalErrors: stats.totalErrors + 1,
    unresolvedErrors: stats.unresolvedErrors + 1,
  });

  // Show alert for high/critical errors
  if (params.severity === 'high' || params.severity === 'critical') {
    activeErrorAlert.set(event);
  }

  // Add to auto-fix queue if auto-fix is possible
  if (errorAnalysis?.canAutoFix && autoFixCommand) {
    pendingAutoFixQueue.setKey(id, event);
    logger.info(`Error ${id} added to auto-fix queue: ${autoFixCommand}`);
  }

  logger.warn(`Error recorded: [${params.type}] ${params.message}`);

  return event;
}

/**
 * Attempt to auto-fix an error
 */
export async function attemptAutoFix(
  errorId: string,
  executeCommand: (command: string) => Promise<{ output?: string; exitCode: number }>,
): Promise<boolean> {
  const event = errorEvents.get()[errorId];

  if (!event) {
    logger.error(`Error event not found: ${errorId}`);
    return false;
  }

  if (!event.autoFixCommand) {
    logger.info(`No auto-fix command available for error ${errorId}`);
    return false;
  }

  isAutoFixing.set(true);

  const updatedEvent = { ...event, autoFixAttempted: true };
  errorEvents.setKey(errorId, updatedEvent);

  try {
    logger.info(`Attempting auto-fix for ${errorId}: ${event.autoFixCommand}`);

    const result = await executeCommand(event.autoFixCommand);

    if (result.exitCode === 0) {
      // Auto-fix succeeded
      const resolvedEvent: ErrorEvent = {
        ...updatedEvent,
        autoFixSucceeded: true,
        resolved: true,
        resolvedAt: Date.now(),
        resolution: `Auto-fixed with: ${event.autoFixCommand}`,
      };

      errorEvents.setKey(errorId, resolvedEvent);
      pendingAutoFixQueue.setKey(errorId, undefined as any);

      // Update stats
      const stats = recoveryStats.get();
      const recoveryTime = (resolvedEvent.resolvedAt ?? resolvedEvent.timestamp) - resolvedEvent.timestamp;
      const totalResolved = stats.autoFixedErrors + 1;
      const avgRecovery =
        stats.averageRecoveryTime > 0
          ? (stats.averageRecoveryTime * stats.autoFixedErrors + recoveryTime) / totalResolved
          : recoveryTime;

      recoveryStats.set({
        ...stats,
        autoFixedErrors: totalResolved,
        unresolvedErrors: Math.max(0, stats.unresolvedErrors - 1),
        averageRecoveryTime: Math.round(avgRecovery),
      });

      if (activeErrorAlert.get()?.id === errorId) {
        activeErrorAlert.set(null);
      }

      logger.info(`Auto-fix succeeded for ${errorId}`);

      return true;
    }

    // Auto-fix failed
    errorEvents.setKey(errorId, {
      ...updatedEvent,
      autoFixSucceeded: false,
    });

    logger.warn(`Auto-fix failed for ${errorId}. Exit code: ${result.exitCode}`);

    return false;
  } catch (error) {
    logger.error(`Auto-fix threw error for ${errorId}:`, error);
    errorEvents.setKey(errorId, {
      ...updatedEvent,
      autoFixSucceeded: false,
    });

    return false;
  } finally {
    isAutoFixing.set(false);
  }
}

/**
 * Resolve an error manually
 */
export function resolveError(errorId: string, resolution: string): void {
  const event = errorEvents.get()[errorId];

  if (!event) {
    return;
  }

  const resolvedEvent: ErrorEvent = {
    ...event,
    resolved: true,
    resolvedAt: Date.now(),
    resolution,
  };

  errorEvents.setKey(errorId, resolvedEvent);
  pendingAutoFixQueue.setKey(errorId, undefined as any);

  // Update stats
  const stats = recoveryStats.get();
  recoveryStats.set({
    ...stats,
    manuallyResolvedErrors: stats.manuallyResolvedErrors + 1,
    unresolvedErrors: Math.max(0, stats.unresolvedErrors - 1),
  });

  if (activeErrorAlert.get()?.id === errorId) {
    activeErrorAlert.set(null);
  }

  logger.info(`Error ${errorId} resolved: ${resolution}`);
}

/**
 * Dismiss the active error alert
 */
export function dismissErrorAlert(): void {
  activeErrorAlert.set(null);
}

// ---- Circuit Breaker ----

/**
 * Check if a provider/API call should be allowed
 */
export function canExecute(provider: string): boolean {
  const state = providerCircuitStates.get()[provider] || circuitState.get();

  if (state === 'closed') {
    return true;
  }

  if (state === 'open') {
    const openedAt = circuitOpenAt[provider] || 0;
    const config = providerConfigs[provider] || defaultCircuitConfig;

    // Check if recovery timeout has elapsed
    if (Date.now() - openedAt >= config.recoveryTimeout) {
      // Transition to half-open
      providerCircuitStates.setKey(provider, 'half-open');
      halfOpenAttempts[provider] = 0;
      logger.info(`Circuit breaker for ${provider} transitioning to half-open`);

      return true;
    }

    return false;
  }

  // Half-open: allow limited attempts
  if (state === 'half-open') {
    const attempts = halfOpenAttempts[provider] || 0;
    const config = providerConfigs[provider] || defaultCircuitConfig;

    if (attempts < config.halfOpenMaxAttempts) {
      halfOpenAttempts[provider] = attempts + 1;
      return true;
    }

    return false;
  }

  return true;
}

/**
 * Record a success for circuit breaker
 */
export function recordSuccess(provider: string): void {
  if (providerCircuitStates.get()[provider] === 'half-open') {
    // Recovery successful, close circuit
    providerCircuitStates.setKey(provider, 'closed');
    failureCounts[provider] = 0;
    logger.info(`Circuit breaker for ${provider} closed (recovery successful)`);
  }

  failureCounts[provider] = 0;
}

/**
 * Record a failure for circuit breaker
 */
export function recordFailure(provider: string, error?: Error): void {
  const config = providerConfigs[provider] || defaultCircuitConfig;
  failureCounts[provider] = (failureCounts[provider] || 0) + 1;

  logger.warn(`Circuit breaker failure for ${provider}: ${failureCounts[provider]}/${config.failureThreshold}`);

  if (failureCounts[provider] >= config.failureThreshold) {
    // Open the circuit
    providerCircuitStates.setKey(provider, 'open');
    circuitOpenAt[provider] = Date.now();

    logger.error(`Circuit breaker OPEN for ${provider}. Will retry after ${config.recoveryTimeout}ms`);

    recordError({
      type: 'api',
      severity: 'high',
      message: `API provider "${provider}" circuit breaker opened due to repeated failures`,
      details: error?.message,
    });
  }
}

/**
 * Configure circuit breaker for a specific provider
 */
export function configureCircuitBreaker(provider: string, config: Partial<CircuitBreakerConfig>): void {
  providerConfigs[provider] = { ...defaultCircuitConfig, ...config };
}

/**
 * Manually reset circuit breaker for a provider
 */
export function resetCircuitBreaker(provider: string): void {
  providerCircuitStates.setKey(provider, 'closed');
  failureCounts[provider] = 0;
  delete circuitOpenAt[provider];
  halfOpenAttempts[provider] = 0;
  logger.info(`Circuit breaker for ${provider} manually reset`);
}

// ---- WebContainer Health Monitoring ----

/**
 * Update WebContainer health status
 */
export function updateWebContainerHealth(status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'): void {
  const previous = webcontainerHealth.get();
  webcontainerHealth.set(status);

  if (previous !== status && status === 'unhealthy') {
    recordError({
      type: 'webcontainer',
      severity: 'critical',
      message: 'WebContainer health check failed',
      details: `Health status changed from ${previous} to ${status}. The preview environment may need to be restarted.`,
    });
  }
}

/**
 * Perform WebContainer health check
 */
export async function checkWebContainerHealth(
  webcontainer: { workdir: string } & Partial<{
    fs: { readdir: (path: string) => Promise<string[]> };
  }>,
): Promise<'healthy' | 'degraded' | 'unhealthy'> {
  try {
    if (!webcontainer.fs) {
      updateWebContainerHealth('unhealthy');
      return 'unhealthy';
    }

    const startTime = Date.now();
    await webcontainer.fs.readdir(webcontainer.workdir);

    const responseTime = Date.now() - startTime;

    if (responseTime > 5000) {
      updateWebContainerHealth('degraded');
      return 'degraded';
    }

    updateWebContainerHealth('healthy');

    return 'healthy';
  } catch {
    updateWebContainerHealth('unhealthy');
    return 'unhealthy';
  }
}

/**
 * Get unresolved errors
 */
export function getUnresolvedErrors(): ErrorEvent[] {
  return Object.values(errorEvents.get())
    .filter((e) => !e.resolved)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get error statistics by type
 */
export function getErrorStatsByType(): Record<string, number> {
  const events = Object.values(errorEvents.get());
  const stats: Record<string, number> = {};

  for (const event of events) {
    stats[event.type] = (stats[event.type] || 0) + 1;
  }

  return stats;
}

/**
 * Clear resolved errors older than specified milliseconds
 */
export function clearOldErrors(olderThanMs: number = 3600000): number {
  const cutoff = Date.now() - olderThanMs;
  const events = errorEvents.get();
  let cleared = 0;

  for (const [id, event] of Object.entries(events)) {
    if (event.resolved && event.resolvedAt && event.resolvedAt < cutoff) {
      errorEvents.setKey(id, undefined as any);
      cleared++;
    }
  }

  logger.info(`Cleared ${cleared} old resolved errors`);

  return cleared;
}

/**
 * Get the next error in the auto-fix queue
 */
export function getNextAutoFixableError(): ErrorEvent | null {
  const queue = pendingAutoFixQueue.get();
  const unresolved = Object.values(queue)
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);

  return unresolved[0] || null;
}

/**
 * Format circuit state for display
 */
export function formatCircuitState(state: CircuitState): { label: string; color: string } {
  switch (state) {
    case 'closed':
      return { label: 'Operational', color: 'text-green-400' };
    case 'open':
      return { label: 'Circuit Open', color: 'text-red-400' };
    case 'half-open':
      return { label: 'Recovering', color: 'text-yellow-400' };
    default:
      return { label: 'Unknown', color: 'text-gray-400' };
  }
}
