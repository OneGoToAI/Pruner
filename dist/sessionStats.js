"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordRequest = recordRequest;
exports.getSessionStats = getSessionStats;
exports.resetSession = resetSession;
const config_1 = require("./config");
/**
 * Internal session state - maintained in memory
 */
let currentSession = {
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
function recordRequest(orig, comp, model) {
    if (orig < 0 || comp < 0) {
        throw new Error('Token counts must be non-negative');
    }
    const pricing = (0, config_1.getPricingConfig)();
    // Calculate costs
    const inputCost = (orig / 1000000) * pricing.inputPerMillion;
    const outputCost = (comp / 1000000) * pricing.inputPerMillion; // Using inputPerMillion for output as well based on common pricing models
    // For now, we'll calculate saved cost based on cache efficiency assumptions
    // This could be made more sophisticated with actual cache hit/miss data
    const potentialCacheSavings = (orig / 1000000) * (pricing.inputPerMillion - pricing.cacheReadPerMillion);
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
function getSessionStats() {
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
function resetSession() {
    currentSession = {
        requests: 0,
        origTokens: 0,
        compTokens: 0,
        savedCost: 0,
        startedAt: new Date(),
    };
}
//# sourceMappingURL=sessionStats.js.map