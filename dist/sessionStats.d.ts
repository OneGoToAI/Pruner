import { SessionStats } from './types';
/**
 * Records a new request with token usage data and updates session statistics
 * @param orig Number of original (input) tokens
 * @param comp Number of completion (output) tokens
 * @param model The model name used for the request
 */
export declare function recordRequest(orig: number, comp: number, model: string): void;
/**
 * Returns the current session statistics
 * @returns A copy of the current session stats
 */
export declare function getSessionStats(): SessionStats;
/**
 * Resets the session statistics to initial state
 */
export declare function resetSession(): void;
//# sourceMappingURL=sessionStats.d.ts.map