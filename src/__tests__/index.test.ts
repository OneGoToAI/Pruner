import {
  SessionStats,
  PricingConfig,
  recordRequest,
  getSessionStats,
  resetSession,
  getPricingConfig,
  defaultPricingConfig,
} from '../index';

describe('Public API Integration', () => {
  beforeEach(() => {
    resetSession();
  });

  it('should export all required functions and constants', () => {
    // Functions should be available
    expect(typeof recordRequest).toBe('function');
    expect(typeof getSessionStats).toBe('function');
    expect(typeof resetSession).toBe('function');
    expect(typeof getPricingConfig).toBe('function');

    // Constants should be available
    expect(typeof defaultPricingConfig).toBe('object');
  });

  it('should provide a complete working session stats workflow', () => {
    // Start with clean session
    resetSession();
    let stats = getSessionStats();
    expect(stats.requests).toBe(0);

    // Record some requests
    recordRequest(1000, 500, 'gpt-4');
    recordRequest(2000, 1000, 'claude-2');

    // Verify accumulation
    stats = getSessionStats();
    expect(stats.requests).toBe(2);
    expect(stats.origTokens).toBe(3000);
    expect(stats.compTokens).toBe(1500);
    expect(stats.savedCost).toBeGreaterThan(0);

    // Reset and verify clean state
    resetSession();
    stats = getSessionStats();
    expect(stats.requests).toBe(0);
    expect(stats.origTokens).toBe(0);
    expect(stats.compTokens).toBe(0);
    expect(stats.savedCost).toBe(0);
  });

  it('should provide consistent pricing configuration', () => {
    const config = getPricingConfig();

    // Should match default values
    expect(config).toEqual(defaultPricingConfig);

    // Should match requirements
    expect(config.inputPerMillion).toBe(3.0);
    expect(config.cacheReadPerMillion).toBe(0.3);
    expect(config.cacheWritePerMillion).toBe(3.75);
  });

  it('should handle real-world usage scenario', () => {
    const pricing = getPricingConfig();

    // Simulate a session with various requests
    const requests = [
      { orig: 500, comp: 250, model: 'gpt-4' },
      { orig: 1200, comp: 800, model: 'claude-2' },
      { orig: 300, comp: 150, model: 'gpt-3.5-turbo' },
      { orig: 2000, comp: 1500, model: 'gpt-4' },
    ];

    requests.forEach(req => {
      recordRequest(req.orig, req.comp, req.model);
    });

    const stats = getSessionStats();

    // Verify totals
    const expectedOrigTokens = requests.reduce((sum, req) => sum + req.orig, 0);
    const expectedCompTokens = requests.reduce((sum, req) => sum + req.comp, 0);

    expect(stats.requests).toBe(requests.length);
    expect(stats.origTokens).toBe(expectedOrigTokens);
    expect(stats.compTokens).toBe(expectedCompTokens);

    // Verify cost calculation consistency
    const expectedSavings = (expectedOrigTokens / 1_000_000) *
      (pricing.inputPerMillion - pricing.cacheReadPerMillion);
    expect(stats.savedCost).toBeCloseTo(expectedSavings, 6);
  });
});