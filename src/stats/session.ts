// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { getConfig, getConfigDir } from '../config.js';

let sessionLogPath: string | null = null;

function getSessionLogPath(): string {
  if (!sessionLogPath) {
    const dir = getConfigDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    sessionLogPath = `${dir}/session.log`;
  }
  return sessionLogPath;
}

export function appendSessionLog(line: string): void {
  try {
    appendFileSync(getSessionLogPath(), line + '\n', 'utf-8');
  } catch { /* best-effort, never crash the proxy */ }
}

export interface SessionStats {
  requests: number;
  origTokens: number;
  compTokens: number;
  /** Cost saved by context pruning / truncation */
  pruneSavedCost: number;
  /** Tokens served from Anthropic's prompt cache (cache_read_input_tokens) */
  cacheHitTokens: number;
  /** Cost saved by cache hits (price diff: input - cache_read) */
  cacheHitSavedCost: number;
  /** Combined savings */
  savedCost: number;
  startedAt: Date;
  /**
   * Requests where origTokens came from Anthropic's count_tokens API
   * (vs tiktoken estimate).  Used to label savings as "verified" or "~estimated".
   */
  verifiedRequests: number;
}

const stats: SessionStats = {
  requests: 0,
  origTokens: 0,
  compTokens: 0,
  pruneSavedCost: 0,
  cacheHitTokens: 0,
  cacheHitSavedCost: 0,
  savedCost: 0,
  startedAt: new Date(),
  verifiedRequests: 0,
};

export interface RequestMetrics {
  /** Token count BEFORE optimization.  Set origVerified=true when this came
   *  from the Anthropic count_tokens API; false = tiktoken estimate. */
  origTokens: number;
  origVerified: boolean;
  /** Actual input tokens billed, from usage.input_tokens in the API response.
   *  This is always accurate (straight from Anthropic). */
  compTokens: number;
  compVerified: boolean;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** True when the client (Claude Code) manages its own caching.
   *  Cache stats from the client's own caching are NOT counted as Pruner savings. */
  clientCacheDetected: boolean;
}

export function recordRequest(metrics: RequestMetrics): void {
  const { pricing } = getConfig();

  const prunedTokens = Math.max(0, metrics.origTokens - metrics.compTokens);
  const pruneSaved = (prunedTokens / 1_000_000) * pricing.inputPerMillion;

  stats.requests++;
  stats.origTokens += metrics.origTokens;
  stats.compTokens += metrics.compTokens;
  stats.pruneSavedCost += pruneSaved;

  // Only count cache savings that Pruner created (message history breakpoints).
  // Claude Code's own system/tools caching is NOT our contribution.
  if (!metrics.clientCacheDetected) {
    const cacheHitSaved =
      (metrics.cacheReadTokens / 1_000_000) *
      (pricing.inputPerMillion - pricing.cacheReadPerMillion);
    const cacheWriteExtra =
      (metrics.cacheCreationTokens / 1_000_000) *
      (pricing.cacheWritePerMillion - pricing.inputPerMillion);
    stats.cacheHitTokens += metrics.cacheReadTokens;
    stats.cacheHitSavedCost += Math.max(0, cacheHitSaved - cacheWriteExtra);
  }
  
  stats.savedCost = stats.pruneSavedCost + stats.cacheHitSavedCost;
  if (metrics.origVerified && metrics.compVerified) stats.verifiedRequests++;
}

export function getStats(): Readonly<SessionStats> {
  return { ...stats };
}

export function resetSession(): void {
  stats.requests = 0;
  stats.origTokens = 0;
  stats.compTokens = 0;
  stats.pruneSavedCost = 0;
  stats.cacheHitTokens = 0;
  stats.cacheHitSavedCost = 0;
  stats.savedCost = 0;
  stats.startedAt = new Date();
  stats.verifiedRequests = 0;
}
