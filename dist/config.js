"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultPricingConfig = void 0;
exports.getPricingConfig = getPricingConfig;
/**
 * Default pricing configuration for token costs
 */
exports.defaultPricingConfig = {
    inputPerMillion: 3.0,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
};
/**
 * Get the current pricing configuration
 * In the future, this could be made configurable through environment variables
 * or external configuration files
 */
function getPricingConfig() {
    return { ...exports.defaultPricingConfig };
}
//# sourceMappingURL=config.js.map