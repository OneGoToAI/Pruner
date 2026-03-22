import {
  formatNumber,
  calculateTokenStats,
  printTokenStats,
  compressMessages,
  createApp,
  TokenStats
} from '../proxy';
import express from 'express';
import request from 'supertest';

// Mock chalk to avoid ANSI color codes in test output
jest.mock('chalk', () => ({
  blue: jest.fn((text) => text),
  cyan: jest.fn((text) => text),
  green: jest.fn((text) => text),
  gray: jest.fn((text) => text),
  yellow: jest.fn((text) => text),
  red: jest.fn((text) => text),
}));

describe('Token Statistics Functions', () => {
  describe('formatNumber', () => {
    it('should format numbers with thousand separators', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(1234567)).toBe('1,234,567');
      expect(formatNumber(42)).toBe('42');
      expect(formatNumber(0)).toBe('0');
    });
  });

  describe('calculateTokenStats', () => {
    it('should calculate correct compression statistics', () => {
      const originalTokens = 4231;
      const compressedTokens = 1052;
      const stats = calculateTokenStats(originalTokens, compressedTokens);

      expect(stats.originalTokens).toBe(originalTokens);
      expect(stats.compressedTokens).toBe(compressedTokens);
      expect(stats.compressionRatio).toBeCloseTo(75.1, 1);
      expect(stats.savings).toBeCloseTo(0.009537, 5); // ((4231-1052)/1000)*0.003
    });

    it('should handle zero compression', () => {
      const originalTokens = 1000;
      const compressedTokens = 1000;
      const stats = calculateTokenStats(originalTokens, compressedTokens);

      expect(stats.compressionRatio).toBe(0);
      expect(stats.savings).toBe(0);
    });

    it('should handle edge case with zero tokens', () => {
      const stats = calculateTokenStats(0, 0);
      expect(stats.compressionRatio).toBe(NaN); // Division by zero
      expect(stats.savings).toBe(0);
    });
  });

  describe('compressMessages', () => {
    it('should return compression results', () => {
      const messages = [
        { role: 'user', content: 'Hello, this is a test message' },
        { role: 'assistant', content: 'This is a response' }
      ];

      const result = compressMessages(messages);

      expect(result.compressed).toEqual(messages);
      expect(result.originalTokens).toBeGreaterThan(0);
      expect(result.compressedTokens).toBeGreaterThan(0);
      expect(result.compressedTokens).toBeLessThan(result.originalTokens);
    });
  });

  describe('printTokenStats', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should print compression statistics', () => {
      const stats: TokenStats = {
        originalTokens: 4231,
        compressedTokens: 1052,
        compressionRatio: 75.1,
        savings: 0.010
      };

      printTokenStats(stats);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Pruner]')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('4,231 → 1,052 tokens')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('-75.1%')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('$0.010')
      );
    });

    it('should print passthrough message', () => {
      const stats: TokenStats = {
        originalTokens: 1000,
        compressedTokens: 1000,
        compressionRatio: 0,
        savings: 0
      };

      printTokenStats(stats, true);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Pruner] → 透传: 1,000 tokens | 无压缩')
      );
    });
  });
});

describe('Express App', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createApp();
  });

  describe('Health Check', () => {
    it('should respond with status ok', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('POST /v1/messages', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should process message request and print token stats', async () => {
      const requestBody = {
        model: 'claude-3.5-sonnet-20241022',
        messages: [
          { role: 'user', content: 'Hello, how are you today?' }
        ],
        max_tokens: 100
      };

      const response = await request(app)
        .post('/v1/messages')
        .send(requestBody)
        .expect(200);

      // Verify response structure
      expect(response.body.id).toBeDefined();
      expect(response.body.type).toBe('message');
      expect(response.body.role).toBe('assistant');
      expect(response.body.model).toBe('claude-3.5-sonnet-20241022');
      expect(response.body.usage).toBeDefined();
      expect(response.body.usage.input_tokens).toBeGreaterThan(0);
      expect(response.body.usage.output_tokens).toBe(150);

      // Verify that token statistics were printed
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Pruner]')
      );
    });

    it('should handle missing model in request', async () => {
      const requestBody = {
        messages: [
          { role: 'user', content: 'Test message' }
        ]
      };

      const response = await request(app)
        .post('/v1/messages')
        .send(requestBody)
        .expect(200);

      expect(response.body.model).toBe('claude-3.5-sonnet-20241022'); // Default model
    });

    it('should handle empty messages array', async () => {
      const requestBody = {
        model: 'claude-3.5-sonnet-20241022',
        messages: []
      };

      const response = await request(app)
        .post('/v1/messages')
        .send(requestBody)
        .expect(200);

      expect(response.body.usage.input_tokens).toBe(0);
    });

    it('should handle malformed request', async () => {
      const response = await request(app)
        .post('/v1/messages')
        .send('invalid json')
        .expect(400);
    });
  });
});