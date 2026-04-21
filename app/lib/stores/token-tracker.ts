/**
 * Token Usage Tracker
 * Tracks LLM token usage per session and provides analytics
 */

import { atom, map, type MapStore } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TokenTracker');

// Token usage record
export interface TokenUsageRecord {
  timestamp: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestId?: string;
}

// Daily usage summary
export interface DailyUsageSummary {
  date: string; // YYYY-MM-DD format
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  requestCount: number;
  byProvider: Record<string, { input: number; output: number }>;
  byModel: Record<string, { input: number; output: number }>;
}

// Usage limits
export interface UsageLimits {
  dailyLimit: number;
  monthlyLimit: number;
  warningThreshold: number; // percentage (e.g., 80 for 80%)
}

// Token usage store
export const tokenUsageHistory: MapStore<Record<string, TokenUsageRecord>> =
  import.meta.hot?.data.tokenUsageHistory ?? map({});
export const dailySummaries: MapStore<Record<string, DailyUsageSummary>> =
  import.meta.hot?.data.dailySummaries ?? map({});
export const currentSessionUsage = atom<{ input: number; output: number }>(
  import.meta.hot?.data.currentSessionUsage ?? { input: 0, output: 0 },
);
export const usageLimits = atom<UsageLimits>({
  dailyLimit: 1_000_000, // 1M tokens default
  monthlyLimit: 10_000_000, // 10M tokens default
  warningThreshold: 80,
});

if (import.meta.hot) {
  import.meta.hot.data.tokenUsageHistory = tokenUsageHistory;
  import.meta.hot.data.dailySummaries = dailySummaries;
  import.meta.hot.data.currentSessionUsage = currentSessionUsage;
}

/**
 * Record token usage from an LLM response
 */
export function recordTokenUsage(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  requestId?: string,
): TokenUsageRecord {
  const timestamp = Date.now();
  const recordId = `${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

  const record: TokenUsageRecord = {
    timestamp,
    provider,
    model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    requestId,
  };

  // Store in history
  tokenUsageHistory.setKey(recordId, record);

  // Update current session
  const current = currentSessionUsage.get();
  currentSessionUsage.set({
    input: current.input + inputTokens,
    output: current.output + outputTokens,
  });

  // Update daily summary
  updateDailySummary(record);

  // Check limits
  checkUsageLimits();

  logger.debug(`Token usage recorded: ${inputTokens} input + ${outputTokens} output = ${record.totalTokens} total`);

  return record;
}

/**
 * Update daily summary with new record
 */
function updateDailySummary(record: TokenUsageRecord): void {
  const date = new Date(record.timestamp).toISOString().split('T')[0];
  const summaries = dailySummaries.get();
  const existing = summaries[date];

  if (existing) {
    // Update existing summary
    const updated: DailyUsageSummary = {
      ...existing,
      totalInputTokens: existing.totalInputTokens + record.inputTokens,
      totalOutputTokens: existing.totalOutputTokens + record.outputTokens,
      totalTokens: existing.totalTokens + record.totalTokens,
      requestCount: existing.requestCount + 1,
      byProvider: {
        ...existing.byProvider,
        [record.provider]: {
          input: (existing.byProvider[record.provider]?.input || 0) + record.inputTokens,
          output: (existing.byProvider[record.provider]?.output || 0) + record.outputTokens,
        },
      },
      byModel: {
        ...existing.byModel,
        [record.model]: {
          input: (existing.byModel[record.model]?.input || 0) + record.inputTokens,
          output: (existing.byModel[record.model]?.output || 0) + record.outputTokens,
        },
      },
    };
    dailySummaries.setKey(date, updated);
  } else {
    // Create new summary
    const newSummary: DailyUsageSummary = {
      date,
      totalInputTokens: record.inputTokens,
      totalOutputTokens: record.outputTokens,
      totalTokens: record.totalTokens,
      requestCount: 1,
      byProvider: {
        [record.provider]: {
          input: record.inputTokens,
          output: record.outputTokens,
        },
      },
      byModel: {
        [record.model]: {
          input: record.inputTokens,
          output: record.outputTokens,
        },
      },
    };
    dailySummaries.setKey(date, newSummary);
  }
}

/**
 * Check if usage is approaching or exceeding limits
 */
function checkUsageLimits(): {
  dailyWarning: boolean;
  dailyExceeded: boolean;
  monthlyWarning: boolean;
  monthlyExceeded: boolean;
  contextWindowWarning: boolean;
  contextWindowPercent: number;
} {
  const limits = usageLimits.get();
  const today = new Date().toISOString().split('T')[0];
  const summaries = dailySummaries.get();
  const todaySummary = summaries[today];

  const dailyTotal = todaySummary?.totalTokens || 0;
  const dailyPercent = (dailyTotal / limits.dailyLimit) * 100;

  // Calculate monthly total
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  let monthlyTotal = 0;

  for (const [date, summary] of Object.entries(summaries)) {
    const summaryDate = new Date(date);

    if (summaryDate >= monthStart) {
      monthlyTotal += summary.totalTokens;
    }
  }

  const monthlyPercent = (monthlyTotal / limits.monthlyLimit) * 100;

  // Context window estimation: track session token growth
  const session = currentSessionUsage.get();
  const contextWindowLimit = 180000; // Typical Claude/GPT context window
  const contextWindowPercent = Math.round(((session.input + session.output) / contextWindowLimit) * 100);
  const contextWindowWarning = contextWindowPercent >= 75;

  const result = {
    dailyWarning: dailyPercent >= limits.warningThreshold,
    dailyExceeded: dailyTotal >= limits.dailyLimit,
    monthlyWarning: monthlyPercent >= limits.warningThreshold,
    monthlyExceeded: monthlyTotal >= limits.monthlyLimit,
    contextWindowWarning,
    contextWindowPercent,
  };

  if (result.dailyWarning) {
    logger.warn(`Daily usage at ${dailyPercent.toFixed(1)}% of limit`);
  }

  if (result.monthlyWarning) {
    logger.warn(`Monthly usage at ${monthlyPercent.toFixed(1)}% of limit`);
  }

  if (result.contextWindowWarning) {
    logger.warn(`Context window at ${contextWindowPercent}% - consider starting a new chat`);
  }

  return result;
}

/**
 * Get usage statistics
 */
export function getUsageStats(): {
  session: { input: number; output: number };
  today: DailyUsageSummary | null;
  thisMonth: {
    totalTokens: number;
    requestCount: number;
    byProvider: Record<string, { input: number; output: number }>;
  };
  limits: UsageLimits;
  contextWarning: {
    shouldWarn: boolean;
    contextWindowPercent: number;
    suggestedAction: string;
  };
} {
  const today = new Date().toISOString().split('T')[0];
  const summaries = dailySummaries.get();
  const todaySummary = summaries[today] || null;

  // Calculate monthly totals
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  let monthlyTokens = 0;
  let monthlyRequests = 0;
  const monthlyByProvider: Record<string, { input: number; output: number }> = {};

  for (const [date, summary] of Object.entries(summaries)) {
    const summaryDate = new Date(date);

    if (summaryDate >= monthStart) {
      monthlyTokens += summary.totalTokens;
      monthlyRequests += summary.requestCount;

      for (const [provider, tokens] of Object.entries(summary.byProvider)) {
        if (!monthlyByProvider[provider]) {
          monthlyByProvider[provider] = { input: 0, output: 0 };
        }

        monthlyByProvider[provider].input += tokens.input;
        monthlyByProvider[provider].output += tokens.output;
      }
    }
  }

  // Context window analysis
  const session = currentSessionUsage.get();
  const contextWindowLimit = 180000;
  const contextWindowPercent = Math.round(((session.input + session.output) / contextWindowLimit) * 100);

  let suggestedAction = '';

  if (contextWindowPercent >= 90) {
    suggestedAction = 'Context window almost full. Start a new chat to avoid errors.';
  } else if (contextWindowPercent >= 75) {
    suggestedAction = 'Context window getting large. Consider starting a new chat soon.';
  } else if (contextWindowPercent >= 50) {
    suggestedAction = 'Context window at half capacity. Responses may slow down.';
  }

  return {
    session: currentSessionUsage.get(),
    today: todaySummary,
    thisMonth: {
      totalTokens: monthlyTokens,
      requestCount: monthlyRequests,
      byProvider: monthlyByProvider,
    },
    limits: usageLimits.get(),
    contextWarning: {
      shouldWarn: contextWindowPercent >= 75,
      contextWindowPercent,
      suggestedAction,
    },
  };
}

/**
 * Set usage limits
 */
export function setUsageLimits(limits: Partial<UsageLimits>): void {
  usageLimits.set({ ...usageLimits.get(), ...limits });
}

/**
 * Reset session usage (call when starting new chat)
 */
export function resetSessionUsage(): void {
  currentSessionUsage.set({ input: 0, output: 0 });
}

/**
 * Clear old history (older than specified days)
 */
export function clearOldHistory(olderThanDays: number = 30): number {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const history = tokenUsageHistory.get();
  let cleared = 0;

  for (const [id, record] of Object.entries(history)) {
    if (record.timestamp < cutoff) {
      tokenUsageHistory.setKey(id, undefined as any);
      cleared++;
    }
  }

  logger.info(`Cleared ${cleared} old token usage records`);

  return cleared;
}

/**
 * Format token count for display
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }

  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }

  return tokens.toString();
}

/**
 * Get usage percentage
 */
export function getUsagePercentage(used: number, limit: number): number {
  return Math.min(100, Math.round((used / limit) * 100));
}
