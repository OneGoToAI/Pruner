/**
 * Integration tests for banner and reporting functionality
 */

import { initializeSession, recordRequest, finalizeSession, getCurrentSession, resetSession } from '../src/stats/report';
import { printStartupBanner, printFinalReport } from '../src/ui/banner';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock chalk and cli-table3
jest.mock('chalk', () => {
  const createColorFunction = (name: string) => {
    const fn = (str: string) => str;
    fn.bold = (str: string) => str;
    return fn;
  };

  return {
    cyan: { bold: (str: string) => str },
    gray: (str: string) => str,
    green: createColorFunction('green'),
    yellow: createColorFunction('yellow'),
    white: (str: string) => str,
    dim: (str: string) => str
  };
});

jest.mock('cli-table3', () => {
  return jest.fn().mockImplementation(() => ({
    push: jest.fn(),
    toString: () => 'Integrated Report Output'
  }));
});

describe('Integration Tests', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSession(); // Reset global session state
    mockFs.existsSync.mockReturnValue(false);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Full session workflow', () => {
    it('should handle complete session lifecycle', () => {
      // 1. Print startup banner
      printStartupBanner({
        version: '1.0.0',
        port: 8080,
        showDetailedStats: true
      });

      expect(consoleSpy).toHaveBeenCalled();

      // 2. Initialize session
      const session = initializeSession();
      expect(session).toBeDefined();
      expect(getCurrentSession()).toBe(session);

      // 3. Record some requests
      recordRequest(10000, 8000); // 20% savings
      recordRequest(5000, 3000);   // 40% savings
      recordRequest(2000, 1800);   // 10% savings

      // Check intermediate stats
      const midStats = session.getSessionStats();
      expect(midStats.requestCount).toBe(3);
      expect(midStats.originalTokens).toBe(17000);
      expect(midStats.compressedTokens).toBe(12800);

      // Overall savings: (17000 - 12800) / 17000 * 100 ≈ 24.7%
      expect(midStats.savingsPercentage).toBeCloseTo(24.7, 1);

      // 4. Finalize session
      const finalStats = finalizeSession();
      expect(finalStats).toBeDefined();
      expect(finalStats!.requestCount).toBe(3);
      expect(getCurrentSession()).toBeNull();

      // 5. Print final report
      printFinalReport(finalStats!);

      // Verify report was printed
      const reportCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(reportCalls).toContain('Integrated Report Output');
    });

    it('should handle empty session gracefully', () => {
      // Initialize session but don't record any requests
      initializeSession();

      const finalStats = finalizeSession();
      expect(finalStats).toBeDefined();
      expect(finalStats!.requestCount).toBe(0);

      // Print final report for empty session
      printFinalReport(finalStats!);

      // Should not crash and should show appropriate message
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should accumulate cumulative savings across sessions', () => {
      // Mock existing cumulative stats
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        totalCostSavings: 10.0,
        totalRequestsProcessed: 100,
        totalTokensSaved: 50000
      }));

      // First session
      const session1 = initializeSession();
      recordRequest(1000, 800);
      session1.finalize();

      const stats1 = session1.getSessionStats();
      expect(stats1.cumulativeCostSavings).toBeGreaterThan(10.0);

      // Reset session to simulate new session
      resetSession();

      // Second session would see updated cumulative stats
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        totalCostSavings: stats1.cumulativeCostSavings,
        totalRequestsProcessed: 101,
        totalTokensSaved: 50200
      }));

      const session2 = initializeSession();
      recordRequest(2000, 1500);

      const stats2 = session2.getSessionStats();
      expect(stats2.cumulativeCostSavings).toBe(stats1.cumulativeCostSavings);

      // Clean up
      finalizeSession();
    });

    it('should handle file system errors gracefully', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Mock file read error
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      // Should still initialize successfully
      const session = initializeSession();
      expect(session).toBeDefined();
      expect(consoleWarnSpy).toHaveBeenCalled();

      // Record a request
      recordRequest(1000, 800);

      // Mock file write error
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('File write error');
      });

      // Should handle write error gracefully
      session.finalize();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    it('should handle perfect compression (100% savings)', () => {
      const session = initializeSession();
      recordRequest(1000, 0); // Perfect compression

      const stats = session.getSessionStats();
      expect(stats.savingsPercentage).toBe(100);
      expect(stats.sessionCostSavings).toBeGreaterThan(0);

      const finalStats = finalizeSession();
      printFinalReport(finalStats!);

      // Should not crash with 100% savings
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle no compression (0% savings)', () => {
      const session = initializeSession();
      recordRequest(1000, 1000); // No compression

      const stats = session.getSessionStats();
      expect(stats.savingsPercentage).toBe(0);
      expect(stats.sessionCostSavings).toBe(0);

      const finalStats = finalizeSession();
      printFinalReport(finalStats!);

      // Should not crash with 0% savings
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle very large numbers', () => {
      const session = initializeSession();
      recordRequest(1000000, 750000); // Large numbers

      const stats = session.getSessionStats();
      expect(stats.originalTokens).toBe(1000000);
      expect(stats.compressedTokens).toBe(750000);
      expect(stats.savingsPercentage).toBe(25);

      const finalStats = finalizeSession();
      printFinalReport(finalStats!);

      // Should format large numbers properly
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle decimal precision correctly', () => {
      const session = initializeSession();
      recordRequest(3333, 2222); // Numbers that create decimal percentages

      const stats = session.getSessionStats();
      expect(stats.savingsPercentage).toBeCloseTo(33.3, 1);

      const finalStats = finalizeSession();
      printFinalReport(finalStats!);

      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});