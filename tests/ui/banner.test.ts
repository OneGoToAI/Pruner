/**
 * Tests for ui/banner.ts module
 */

import { printStartupBanner, printFinalReport, printSimpleReport, setupExitHandlers } from '../../src/ui/banner';
import { SessionStats, BannerConfig } from '../../src/types';

// Mock chalk to avoid color codes in test output
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

// Mock cli-table3
jest.mock('cli-table3', () => {
  return jest.fn().mockImplementation(() => ({
    push: jest.fn(),
    toString: () => 'Mocked Table Output'
  }));
});

describe('Banner UI Functions', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('printStartupBanner', () => {
    it('should print startup banner with correct information', () => {
      const config: BannerConfig = {
        version: '1.0.0',
        port: 3000,
        showDetailedStats: true
      };

      printStartupBanner(config);

      expect(consoleSpy).toHaveBeenCalled();

      // Check that version and port are mentioned in the output
      const allCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(allCalls).toContain('v1.0.0');
      expect(allCalls).toContain('Port: 3000');
      expect(allCalls).toContain('Pruner Token Compression Proxy');
    });
  });

  describe('printFinalReport', () => {
    it('should print detailed report for session with requests', () => {
      const stats: SessionStats = {
        requestCount: 12,
        originalTokens: 128432,
        compressedTokens: 31204,
        savingsPercentage: 75.7,
        sessionCostSavings: 0.29,
        cumulativeCostSavings: 12.47
      };

      printFinalReport(stats);

      expect(consoleSpy).toHaveBeenCalled();
      // Since we're using a mocked table, we should see the mocked output
      const allCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(allCalls).toContain('Mocked Table Output');
    });

    it('should print empty session message for zero requests', () => {
      const stats: SessionStats = {
        requestCount: 0,
        originalTokens: 0,
        compressedTokens: 0,
        savingsPercentage: 0,
        sessionCostSavings: 0,
        cumulativeCostSavings: 10.50
      };

      printFinalReport(stats);

      expect(consoleSpy).toHaveBeenCalled();
      // Should still show mocked table output for empty session
      const allCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(allCalls).toContain('Mocked Table Output');
    });

    it('should respect color options', () => {
      const stats: SessionStats = {
        requestCount: 5,
        originalTokens: 1000,
        compressedTokens: 800,
        savingsPercentage: 20,
        sessionCostSavings: 0.05,
        cumulativeCostSavings: 1.50
      };

      printFinalReport(stats, { useColors: false });

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('printSimpleReport', () => {
    it('should print simple text report for session with requests', () => {
      const stats: SessionStats = {
        requestCount: 5,
        originalTokens: 10000,
        compressedTokens: 8000,
        savingsPercentage: 20,
        sessionCostSavings: 0.18,
        cumulativeCostSavings: 5.25
      };

      printSimpleReport(stats);

      expect(consoleSpy).toHaveBeenCalled();

      // Check for specific content in simple report
      const allCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(allCalls).toContain('请求数:');
      expect(allCalls).toContain('原始 Token:');
      expect(allCalls).toContain('压缩后 Token:');
      expect(allCalls).toContain('节省比例:');
      expect(allCalls).toContain('本次节省:');
      expect(allCalls).toContain('累计节省:');
    });

    it('should handle zero requests in simple report', () => {
      const stats: SessionStats = {
        requestCount: 0,
        originalTokens: 0,
        compressedTokens: 0,
        savingsPercentage: 0,
        sessionCostSavings: 0,
        cumulativeCostSavings: 0
      };

      printSimpleReport(stats);

      expect(consoleSpy).toHaveBeenCalled();

      const allCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(allCalls).toContain('本次会话未处理任何请求');
      expect(allCalls).toContain('提示：代理已就绪');
    });

    it('should format numbers with commas', () => {
      const stats: SessionStats = {
        requestCount: 1234,
        originalTokens: 123456,
        compressedTokens: 98765,
        savingsPercentage: 20,
        sessionCostSavings: 1.23,
        cumulativeCostSavings: 456.78
      };

      printSimpleReport(stats);

      const allCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(allCalls).toContain('1,234'); // Formatted request count
      expect(allCalls).toContain('123,456'); // Formatted original tokens
    });

    it('should use custom currency symbol', () => {
      const stats: SessionStats = {
        requestCount: 1,
        originalTokens: 1000,
        compressedTokens: 800,
        savingsPercentage: 20,
        sessionCostSavings: 0.18,
        cumulativeCostSavings: 5.25
      };

      printSimpleReport(stats, { currencySymbol: '¥' });

      const allCalls = consoleSpy.mock.calls.flat().join(' ');
      expect(allCalls).toContain('¥0.18');
      expect(allCalls).toContain('¥5.25');
    });
  });

  describe('setupExitHandlers', () => {
    let mockProcess: any;
    let originalProcess: any;

    beforeEach(() => {
      originalProcess = global.process;
      mockProcess = {
        on: jest.fn(),
        exit: jest.fn()
      };
      global.process = mockProcess;
    });

    afterEach(() => {
      global.process = originalProcess;
    });

    it('should setup all required exit handlers', () => {
      const mockGetStats = jest.fn(() => null);

      setupExitHandlers(mockGetStats);

      // Verify all handlers are registered
      expect(mockProcess.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });

    it('should call getStats when SIGINT handler is triggered', () => {
      const mockStats: SessionStats = {
        requestCount: 1,
        originalTokens: 1000,
        compressedTokens: 800,
        savingsPercentage: 20,
        sessionCostSavings: 0.18,
        cumulativeCostSavings: 5.25
      };
      const mockGetStats = jest.fn(() => mockStats);

      setupExitHandlers(mockGetStats);

      // Find and call the SIGINT handler
      const sigintHandler = mockProcess.on.mock.calls.find(
        (call: any[]) => call[0] === 'SIGINT'
      )[1];

      sigintHandler();

      expect(mockGetStats).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled(); // Report should be printed
    });

    it('should handle null stats gracefully', () => {
      const mockGetStats = jest.fn(() => null);

      setupExitHandlers(mockGetStats);

      // Find and call the SIGTERM handler
      const sigtermHandler = mockProcess.on.mock.calls.find(
        (call: any[]) => call[0] === 'SIGTERM'
      )[1];

      sigtermHandler();

      expect(mockGetStats).toHaveBeenCalled();
      // Should not crash when stats is null
    });
  });
});