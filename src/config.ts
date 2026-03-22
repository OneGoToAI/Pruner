import { PricingConfig } from './types';

/**
 * Default pricing configuration for token costs
 */
export const defaultPricingConfig: PricingConfig = {
  inputPerMillion: 3.0,
  cacheReadPerMillion: 0.3,
  cacheWritePerMillion: 3.75,
};

/**
 * Get the current pricing configuration
 * In the future, this could be made configurable through environment variables
 * or external configuration files
 */
export function getPricingConfig(): PricingConfig {
  return { ...defaultPricingConfig };
}