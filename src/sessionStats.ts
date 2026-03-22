import { SessionStats } from './types';
import { getPricingConfig } from './config';

/**
 * Internal session state - maintained in memory
 */
let currentSession: SessionStats = {
  requests: 0,
  origTokens: 0,
  compTokens: 0,
  savedCost: 0,
  startedAt: new Date(),
};

/**
 * Records a new request with token usage data and updates session statistics
 * @param orig Number of original (input) tokens
 * @param comp Number of completion (output) tokens
 * @param model The model name used for the request
 */
export function recordRequest(orig: number, comp: number, model: string): void {
  if (orig < 0 || comp < 0) {
    throw new Error('Token counts must be non-negative');
  }

  const pricing = getPricingConfig();

  // Calculate costs
  const inputCost = (orig / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (comp / 1_000_000) * pricing.inputPerMillion; // Using inputPerMillion for output as well based on common pricing models

  // For now, we'll calculate saved cost based on cache efficiency assumptions
  // This could be made more sophisticated with actual cache hit/miss data
  const potentialCacheSavings = (orig / 1_000_000) * (pricing.inputPerMillion - pricing.cacheReadPerMillion);

  // Update session stats
  currentSession.requests += 1;
  currentSession.origTokens += orig;
  currentSession.compTokens += comp;
  currentSession.savedCost += potentialCacheSavings; // Simplified calculation
}

/**
 * Returns the current session statistics
 * @returns A copy of the current session stats
 */
export function getSessionStats(): SessionStats {
  return {
    requests: currentSession.requests,
    origTokens: currentSession.origTokens,
    compTokens: currentSession.compTokens,
    savedCost: currentSession.savedCost,
    startedAt: new Date(currentSession.startedAt),
  };
}

/**
 * Resets the session statistics to initial state
 */
export function resetSession(): void {
  currentSession = {
    requests: 0,
    origTokens: 0,
    compTokens: 0,
    savedCost: 0,
    startedAt: new Date(),
  };
}