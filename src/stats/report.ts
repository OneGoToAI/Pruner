/**
 * Session statistics tracking and report generation for Pruner
 */

import { SessionStats } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// Constants for cost calculation (per 1K tokens)
const INPUT_TOKEN_COST = 0.003; // $0.003 per 1K input tokens
const OUTPUT_TOKEN_COST = 0.015; // $0.015 per 1K output tokens

// File to store cumulative statistics
const STATS_FILE = path.join(process.cwd(), '.pruner-stats.json');

interface CumulativeStats {
  totalCostSavings: number;
  totalRequestsProcessed: number;
  totalTokensSaved: number;
}

export class SessionReporter {
  private stats: SessionStats;
  private startTime: Date;

  constructor() {
    this.stats = {
      requestCount: 0,
      originalTokens: 0,
      compressedTokens: 0,
      savingsPercentage: 0,
      sessionCostSavings: 0,
      cumulativeCostSavings: 0
    };
    this.startTime = new Date();
    this.loadCumulativeStats();
  }

  /**
   * Record a single request with its token usage
   */
  recordRequest(originalTokens: number, compressedTokens: number): void {
    this.stats.requestCount++;
    this.stats.originalTokens += originalTokens;
    this.stats.compressedTokens += compressedTokens;

    this.updateCalculatedStats();
  }

  /**
   * Get current session statistics
   */
  getSessionStats(): SessionStats {
    return { ...this.stats };
  }

  /**
   * Get session duration in milliseconds
   */
  getSessionDuration(): number {
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Get session duration as human-readable string
   */
  getSessionDurationString(): string {
    const durationMs = this.getSessionDuration();
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Save current session stats and update cumulative totals
   */
  finalize(): void {
    if (this.stats.requestCount === 0) {
      return; // No requests to save
    }

    // Update cumulative stats
    const cumulative = this.loadCumulativeStatsFromFile();
    cumulative.totalCostSavings += this.stats.sessionCostSavings;
    cumulative.totalRequestsProcessed += this.stats.requestCount;
    cumulative.totalTokensSaved += (this.stats.originalTokens - this.stats.compressedTokens);

    this.saveCumulativeStats(cumulative);

    // Update the current stats with new cumulative total
    this.stats.cumulativeCostSavings = cumulative.totalCostSavings;
  }

  private updateCalculatedStats(): void {
    if (this.stats.originalTokens === 0) {
      this.stats.savingsPercentage = 0;
      this.stats.sessionCostSavings = 0;
      return;
    }

    // Calculate savings percentage
    const tokensSaved = this.stats.originalTokens - this.stats.compressedTokens;
    this.stats.savingsPercentage = (tokensSaved / this.stats.originalTokens) * 100;

    // Calculate cost savings (assuming average mix of input/output tokens)
    const avgTokenCost = (INPUT_TOKEN_COST + OUTPUT_TOKEN_COST) / 2;
    this.stats.sessionCostSavings = (tokensSaved / 1000) * avgTokenCost;
  }

  private loadCumulativeStats(): void {
    const cumulative = this.loadCumulativeStatsFromFile();
    this.stats.cumulativeCostSavings = cumulative.totalCostSavings;
  }

  private loadCumulativeStatsFromFile(): CumulativeStats {
    try {
      if (fs.existsSync(STATS_FILE)) {
        const data = fs.readFileSync(STATS_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      // If there's an error reading the file, start fresh
      console.warn('Failed to load cumulative stats:', error);
    }

    return {
      totalCostSavings: 0,
      totalRequestsProcessed: 0,
      totalTokensSaved: 0
    };
  }

  private saveCumulativeStats(stats: CumulativeStats): void {
    try {
      fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    } catch (error) {
      console.error('Failed to save cumulative stats:', error);
    }
  }
}

// Global instance for session tracking
let sessionReporter: SessionReporter | null = null;

/**
 * Initialize the session reporter
 */
export function initializeSession(): SessionReporter {
  if (sessionReporter) {
    throw new Error('Session already initialized');
  }

  sessionReporter = new SessionReporter();
  return sessionReporter;
}

/**
 * Get the current session reporter instance
 */
export function getCurrentSession(): SessionReporter | null {
  return sessionReporter;
}

/**
 * Record a request in the current session
 */
export function recordRequest(originalTokens: number, compressedTokens: number): void {
  if (!sessionReporter) {
    throw new Error('Session not initialized. Call initializeSession() first.');
  }

  sessionReporter.recordRequest(originalTokens, compressedTokens);
}

/**
 * Finalize the current session and save statistics
 */
export function finalizeSession(): SessionStats | null {
  if (!sessionReporter) {
    return null;
  }

  sessionReporter.finalize();
  const stats = sessionReporter.getSessionStats();

  sessionReporter = null; // Reset for next session
  return stats;
}

/**
 * Reset the session state (for testing purposes)
 */
export function resetSession(): void {
  sessionReporter = null;
}