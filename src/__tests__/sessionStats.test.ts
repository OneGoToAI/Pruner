import { recordRequest, getSessionStats, resetSession } from '../sessionStats';
import { getPricingConfig } from '../config';

describe('Session Stats', () => {
  beforeEach(() => {
    resetSession();
  });

  describe('resetSession', () => {
    it('should initialize session with zero values and current timestamp', () => {
      const before = Date.now();
      resetSession();
      const stats = getSessionStats();
      const after = Date.now();

      expect(stats.requests).toBe(0);
      expect(stats.origTokens).toBe(0);
      expect(stats.compTokens).toBe(0);
      expect(stats.savedCost).toBe(0);
      expect(stats.startedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(stats.startedAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('recordRequest', () => {
    it('should increment request count correctly', () => {
      recordRequest(100, 50, 'gpt-4');
      expect(getSessionStats().requests).toBe(1);

      recordRequest(200, 100, 'gpt-4');
      expect(getSessionStats().requests).toBe(2);

      recordRequest(150, 75, 'gpt-3.5');
      expect(getSessionStats().requests).toBe(3);
    });

    it('should accumulate token counts correctly', () => {
      recordRequest(100, 50, 'gpt-4');
      let stats = getSessionStats();
      expect(stats.origTokens).toBe(100);
      expect(stats.compTokens).toBe(50);

      recordRequest(200, 100, 'gpt-4');
      stats = getSessionStats();
      expect(stats.origTokens).toBe(300); // 100 + 200
      expect(stats.compTokens).toBe(150); // 50 + 100

      recordRequest(50, 25, 'gpt-3.5');
      stats = getSessionStats();
      expect(stats.origTokens).toBe(350); // 300 + 50
      expect(stats.compTokens).toBe(175); // 150 + 25
    });

    it('should calculate saved costs based on pricing configuration', () => {
      const pricing = getPricingConfig();
      const inputTokens = 1_000_000; // 1 million tokens for easy calculation

      recordRequest(inputTokens, 500_000, 'gpt-4');
      const stats = getSessionStats();

      // Expected saved cost: (tokens / 1M) * (inputPerMillion - cacheReadPerMillion)
      const expectedSavings = (inputTokens / 1_000_000) * (pricing.inputPerMillion - pricing.cacheReadPerMillion);
      expect(stats.savedCost).toBeCloseTo(expectedSavings, 6);
    });

    it('should handle zero token counts', () => {
      recordRequest(0, 0, 'gpt-4');
      const stats = getSessionStats();

      expect(stats.requests).toBe(1);
      expect(stats.origTokens).toBe(0);
      expect(stats.compTokens).toBe(0);
      expect(stats.savedCost).toBe(0);
    });

    it('should throw error for negative token counts', () => {
      expect(() => recordRequest(-100, 50, 'gpt-4')).toThrow('Token counts must be non-negative');
      expect(() => recordRequest(100, -50, 'gpt-4')).toThrow('Token counts must be non-negative');
      expect(() => recordRequest(-100, -50, 'gpt-4')).toThrow('Token counts must be non-negative');
    });

    it('should handle different model names without affecting calculations', () => {
      recordRequest(100, 50, 'gpt-4');
      recordRequest(200, 100, 'claude-2');
      recordRequest(150, 75, 'gpt-3.5-turbo');

      const stats = getSessionStats();
      expect(stats.requests).toBe(3);
      expect(stats.origTokens).toBe(450); // 100 + 200 + 150
      expect(stats.compTokens).toBe(225); // 50 + 100 + 75
    });
  });

  describe('getSessionStats', () => {
    it('should return a copy of session stats, not reference', () => {
      recordRequest(100, 50, 'gpt-4');
      const stats1 = getSessionStats();
      const stats2 = getSessionStats();

      expect(stats1).not.toBe(stats2); // Different objects
      expect(stats1).toEqual(stats2); // Same values

      // Modifying returned object should not affect internal state
      stats1.requests = 999;
      const stats3 = getSessionStats();
      expect(stats3.requests).toBe(1); // Should still be original value
    });

    it('should return Date object copies for startedAt', () => {
      const stats1 = getSessionStats();
      const stats2 = getSessionStats();

      expect(stats1.startedAt).not.toBe(stats2.startedAt); // Different Date objects
      expect(stats1.startedAt.getTime()).toBe(stats2.startedAt.getTime()); // Same timestamp

      // Modifying returned Date should not affect internal state
      stats1.startedAt.setFullYear(2020);
      const stats3 = getSessionStats();
      expect(stats3.startedAt.getFullYear()).not.toBe(2020);
    });
  });

  describe('cost calculation accuracy', () => {
    it('should calculate costs consistent with pricing configuration', () => {
      const pricing = getPricingConfig();

      // Test with exact million tokens for precise calculation
      const inputTokens = 2_000_000; // 2 million tokens
      const outputTokens = 1_000_000; // 1 million tokens

      recordRequest(inputTokens, outputTokens, 'gpt-4');
      const stats = getSessionStats();

      // Expected calculation based on current implementation:
      // savedCost = (origTokens / 1M) * (inputPerMillion - cacheReadPerMillion)
      const expectedSavings = (inputTokens / 1_000_000) * (pricing.inputPerMillion - pricing.cacheReadPerMillion);
      expect(stats.savedCost).toBeCloseTo(expectedSavings, 6);

      // Verify pricing values match requirements
      expect(pricing.inputPerMillion).toBe(3.0);
      expect(pricing.cacheReadPerMillion).toBe(0.3);
      expect(pricing.cacheWritePerMillion).toBe(3.75);
    });
  });

  describe('session lifecycle', () => {
    it('should maintain session state across multiple operations', () => {
      // First request
      recordRequest(100, 50, 'gpt-4');
      let stats = getSessionStats();
      const initialStartTime = stats.startedAt;
      expect(stats.requests).toBe(1);

      // Second request - should accumulate
      recordRequest(200, 100, 'claude-2');
      stats = getSessionStats();
      expect(stats.requests).toBe(2);
      expect(stats.origTokens).toBe(300);
      expect(stats.compTokens).toBe(150);
      expect(stats.startedAt).toEqual(initialStartTime); // Should not change

      // Reset and verify clean state
      resetSession();
      stats = getSessionStats();
      expect(stats.requests).toBe(0);
      expect(stats.origTokens).toBe(0);
      expect(stats.compTokens).toBe(0);
      expect(stats.savedCost).toBe(0);
      expect(stats.startedAt.getTime()).toBeGreaterThanOrEqual(initialStartTime.getTime());
    });
  });
});