import { getPricingConfig, defaultPricingConfig } from '../config';

describe('Config', () => {
  describe('defaultPricingConfig', () => {
    it('should have correct pricing values as specified in requirements', () => {
      expect(defaultPricingConfig.inputPerMillion).toBe(3.0);
      expect(defaultPricingConfig.cacheReadPerMillion).toBe(0.3);
      expect(defaultPricingConfig.cacheWritePerMillion).toBe(3.75);
    });

    it('should have all required properties', () => {
      expect(defaultPricingConfig).toHaveProperty('inputPerMillion');
      expect(defaultPricingConfig).toHaveProperty('cacheReadPerMillion');
      expect(defaultPricingConfig).toHaveProperty('cacheWritePerMillion');
    });

    it('should have non-negative pricing values', () => {
      expect(defaultPricingConfig.inputPerMillion).toBeGreaterThanOrEqual(0);
      expect(defaultPricingConfig.cacheReadPerMillion).toBeGreaterThanOrEqual(0);
      expect(defaultPricingConfig.cacheWritePerMillion).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getPricingConfig', () => {
    it('should return a copy of the default configuration', () => {
      const config = getPricingConfig();

      expect(config).toEqual(defaultPricingConfig);
      expect(config).not.toBe(defaultPricingConfig); // Should be a different object
    });

    it('should return consistent values across multiple calls', () => {
      const config1 = getPricingConfig();
      const config2 = getPricingConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });

    it('should be safe to modify returned config without affecting defaults', () => {
      const config = getPricingConfig();
      const originalInputPrice = defaultPricingConfig.inputPerMillion;

      config.inputPerMillion = 999;

      expect(defaultPricingConfig.inputPerMillion).toBe(originalInputPrice);
      expect(getPricingConfig().inputPerMillion).toBe(originalInputPrice);
    });
  });
});