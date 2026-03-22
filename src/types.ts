/**
 * Session statistics interface for tracking token usage and costs
 */
export interface SessionStats {
  /** Number of requests made in this session */
  requests: number;
  /** Total original (input) tokens consumed */
  origTokens: number;
  /** Total completion (output) tokens generated */
  compTokens: number;
  /** Total cost saved through caching and optimization */
  savedCost: number;
  /** Timestamp when the session started */
  startedAt: Date;
}

/**
 * Pricing configuration for different token types
 */
export interface PricingConfig {
  /** Cost per million input tokens */
  inputPerMillion: number;
  /** Cost per million cached read tokens */
  cacheReadPerMillion: number;
  /** Cost per million cached write tokens */
  cacheWritePerMillion: number;
}