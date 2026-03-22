/**
 * Tests for stats/report.ts module
 */

import { SessionReporter, initializeSession, getCurrentSession, recordRequest, finalizeSession, resetSession } from '../../src/stats/report';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('SessionReporter', () => {
  let reporter: SessionReporter;

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock fs.existsSync to return false by default
    mockFs.existsSync.mockReturnValue(false);
    reporter = new SessionReporter();
  });

  describe('initialization', () => {
    it('should initialize with zero stats', () => {
      const stats = reporter.getSessionStats();

      expect(stats.requestCount).toBe(0);
      expect(stats.originalTokens).toBe(0);
      expect(stats.compressedTokens).toBe(0);
      expect(stats.savingsPercentage).toBe(0);
      expect(stats.sessionCostSavings).toBe(0);
      expect(stats.cumulativeCostSavings).toBe(0);
    });

    it('should load cumulative stats from file if it exists', () => {
      const mockStats = {
        totalCostSavings: 10.50,
        totalRequestsProcessed: 100,
        totalTokensSaved: 50000
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockStats));

      const reporterWithStats = new SessionReporter();
      const stats = reporterWithStats.getSessionStats();

      expect(stats.cumulativeCostSavings).toBe(10.50);
    });

    it('should handle corrupted stats file gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const reporterWithCorruptedStats = new SessionReporter();
      const stats = reporterWithCorruptedStats.getSessionStats();

      expect(stats.cumulativeCostSavings).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('recordRequest', () => {
    it('should record a single request correctly', () => {
      reporter.recordRequest(1000, 800);

      const stats = reporter.getSessionStats();
      expect(stats.requestCount).toBe(1);
      expect(stats.originalTokens).toBe(1000);
      expect(stats.compressedTokens).toBe(800);
      expect(stats.savingsPercentage).toBe(20); // 200/1000 * 100
      expect(stats.sessionCostSavings).toBeCloseTo(0.0018); // (200/1000) * ((0.003 + 0.015) / 2)
    });

    it('should accumulate multiple requests', () => {
      reporter.recordRequest(1000, 800);
      reporter.recordRequest(2000, 1000);

      const stats = reporter.getSessionStats();
      expect(stats.requestCount).toBe(2);
      expect(stats.originalTokens).toBe(3000);
      expect(stats.compressedTokens).toBe(1800);
      expect(stats.savingsPercentage).toBe(40); // 1200/3000 * 100
    });

    it('should handle zero savings correctly', () => {
      reporter.recordRequest(1000, 1000);

      const stats = reporter.getSessionStats();
      expect(stats.savingsPercentage).toBe(0);
      expect(stats.sessionCostSavings).toBe(0);
    });

    it('should handle zero original tokens', () => {
      reporter.recordRequest(0, 0);

      const stats = reporter.getSessionStats();
      expect(stats.savingsPercentage).toBe(0);
      expect(stats.sessionCostSavings).toBe(0);
    });
  });

  describe('session duration', () => {
    it('should track session duration', () => {
      const duration = reporter.getSessionDuration();
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should format duration string correctly', () => {
      const durationString = reporter.getSessionDurationString();
      expect(durationString).toMatch(/^\d+[hms]/);
    });
  });

  describe('finalize', () => {
    it('should not save if no requests were recorded', () => {
      reporter.finalize();

      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should save cumulative stats when requests were recorded', () => {
      reporter.recordRequest(1000, 800);

      // Mock existing cumulative stats
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        totalCostSavings: 5.0,
        totalRequestsProcessed: 50,
        totalTokensSaved: 25000
      }));

      reporter.finalize();

      expect(mockFs.writeFileSync).toHaveBeenCalled();

      const savedData = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(savedData.totalRequestsProcessed).toBe(51); // 50 + 1
      expect(savedData.totalTokensSaved).toBe(25200); // 25000 + 200
    });

    it('should handle file write errors gracefully', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      reporter.recordRequest(1000, 800);
      reporter.finalize();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

describe('Global session functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSession(); // Reset global session state
    mockFs.existsSync.mockReturnValue(false);
  });

  describe('session lifecycle', () => {
    it('should initialize and get current session', () => {
      const session = initializeSession();
      expect(session).toBeInstanceOf(SessionReporter);

      const currentSession = getCurrentSession();
      expect(currentSession).toBe(session);
    });

    it('should throw error when initializing twice', () => {
      initializeSession();

      expect(() => initializeSession()).toThrow('Session already initialized');
    });

    it('should record request through global function', () => {
      const session = initializeSession();
      recordRequest(1000, 800);

      const stats = session.getSessionStats();
      expect(stats.requestCount).toBe(1);
      expect(stats.originalTokens).toBe(1000);
      expect(stats.compressedTokens).toBe(800);
    });

    it('should throw error when recording request without initialization', () => {
      expect(() => recordRequest(1000, 800)).toThrow('Session not initialized');
    });

    it('should finalize session and return stats', () => {
      const session = initializeSession();
      recordRequest(1000, 800);

      const finalStats = finalizeSession();

      expect(finalStats).toBeDefined();
      expect(finalStats!.requestCount).toBe(1);
      expect(getCurrentSession()).toBeNull();
    });

    it('should return null when finalizing without initialization', () => {
      const result = finalizeSession();
      expect(result).toBeNull();
    });
  });
});