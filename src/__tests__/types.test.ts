import { SessionStats, PricingConfig } from '../types';

describe('Types', () => {
  describe('SessionStats interface', () => {
    it('should allow creating valid SessionStats objects', () => {
      const validStats: SessionStats = {
        requests: 5,
        origTokens: 1000,
        compTokens: 500,
        savedCost: 2.5,
        startedAt: new Date(),
      };

      expect(validStats.requests).toBe(5);
      expect(validStats.origTokens).toBe(1000);
      expect(validStats.compTokens).toBe(500);
      expect(validStats.savedCost).toBe(2.5);
      expect(validStats.startedAt).toBeInstanceOf(Date);
    });

    it('should support zero values', () => {
      const zeroStats: SessionStats = {
        requests: 0,
        origTokens: 0,
        compTokens: 0,
        savedCost: 0,
        startedAt: new Date(),
      };

      expect(zeroStats.requests).toBe(0);
      expect(zeroStats.origTokens).toBe(0);
      expect(zeroStats.compTokens).toBe(0);
      expect(zeroStats.savedCost).toBe(0);
    });
  });

  describe('PricingConfig interface', () => {
    it('should allow creating valid PricingConfig objects', () => {
      const validPricing: PricingConfig = {
        inputPerMillion: 3.0,
        cacheReadPerMillion: 0.3,
        cacheWritePerMillion: 3.75,
      };

      expect(validPricing.inputPerMillion).toBe(3.0);
      expect(validPricing.cacheReadPerMillion).toBe(0.3);
      expect(validPricing.cacheWritePerMillion).toBe(3.75);
    });

    it('should support different pricing values', () => {
      const customPricing: PricingConfig = {
        inputPerMillion: 5.0,
        cacheReadPerMillion: 0.5,
        cacheWritePerMillion: 4.0,
      };

      expect(customPricing.inputPerMillion).toBe(5.0);
      expect(customPricing.cacheReadPerMillion).toBe(0.5);
      expect(customPricing.cacheWritePerMillion).toBe(4.0);
    });
  });
});