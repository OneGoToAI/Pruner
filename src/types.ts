/**
 * Types for Pruner session statistics and reporting
 */

export interface SessionStats {
  /** Total number of API requests processed */
  requestCount: number;

  /** Total tokens before compression */
  originalTokens: number;

  /** Total tokens after compression */
  compressedTokens: number;

  /** Percentage of tokens saved (0-100) */
  savingsPercentage: number;

  /** Cost savings for this session in USD */
  sessionCostSavings: number;

  /** Cumulative cost savings across all sessions in USD */
  cumulativeCostSavings: number;
}

export interface BannerConfig {
  /** Application version */
  version: string;

  /** Proxy server port */
  port: number;

  /** Whether to show detailed statistics */
  showDetailedStats: boolean;
}

export interface ReportOptions {
  /** Whether to use colors in the output */
  useColors: boolean;

  /** Width of the banner in characters */
  bannerWidth: number;

  /** Currency symbol to use for cost display */
  currencySymbol: string;
}