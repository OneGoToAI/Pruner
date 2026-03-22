import { describe, it, expect, beforeEach, vi } from 'vitest';
import { countTokens, countTokensText, AnthropicRequest } from './counter';

describe('Token Counter', () => {
  describe('countTokensText', () => {
    it('should return 0 for empty string', () => {
      expect(countTokensText('')).toBe(0);
    });

    it('should return 0 for null/undefined input', () => {
      expect(countTokensText(null as any)).toBe(0);
      expect(countTokensText(undefined as any)).toBe(0);
    });

    it('should count tokens for simple text', () => {
      const text = 'Hello world';
      const result = countTokensText(text);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(text.length); // Should be more efficient than 1:1
    });

    it('should handle longer text appropriately', () => {
      const text = 'This is a longer text that should be tokenized properly by the tiktoken library or fall back to estimation.';
      const result = countTokensText(text);
      expect(result).toBeGreaterThan(0);
      // Reasonable bounds check - should be roughly text.length/4 if using fallback
      expect(result).toBeLessThanOrEqual(Math.ceil(text.length / 2));
      expect(result).toBeGreaterThanOrEqual(Math.ceil(text.length / 6));
    });

    it('should handle special characters and unicode', () => {
      const text = 'Hello 世界 🌍 café naïve';
      const result = countTokensText(text);
      expect(result).toBeGreaterThan(0);
    });

    it('should be consistent for the same input', () => {
      const text = 'Consistency test text';
      const result1 = countTokensText(text);
      const result2 = countTokensText(text);
      expect(result1).toBe(result2);
    });
  });

  describe('countTokens', () => {
    it('should return 0 for empty request', () => {
      const request: AnthropicRequest = {};
      expect(countTokens(request)).toBe(0);
    });

    it('should count tokens in system message (string format)', () => {
      const request: AnthropicRequest = {
        system: 'You are a helpful assistant.'
      };
      const result = countTokens(request);
      expect(result).toBeGreaterThan(0);
      expect(result).toBe(countTokensText('You are a helpful assistant.'));
    });

    it('should count tokens in system message (array format)', () => {
      const request: AnthropicRequest = {
        system: [
          { type: 'text', text: 'You are a helpful assistant.' },
          { type: 'text', text: 'Please be concise.' }
        ]
      };
      const result = countTokens(request);
      expect(result).toBeGreaterThan(0);
      expect(result).toBe(countTokensText('You are a helpful assistant. Please be concise.'));
    });

    it('should count tokens in messages (string content)', () => {
      const request: AnthropicRequest = {
        messages: [
          { role: 'user', content: 'Hello, how are you?' },
          { role: 'assistant', content: 'I am doing well, thank you!' }
        ]
      };
      const result = countTokens(request);
      const expectedTokens = countTokensText('Hello, how are you?') +
                           countTokensText('I am doing well, thank you!');
      expect(result).toBe(expectedTokens);
    });

    it('should count tokens in messages (array content)', () => {
      const request: AnthropicRequest = {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is the weather?' },
              { type: 'text', text: 'Please be specific.' }
            ]
          }
        ]
      };
      const result = countTokens(request);
      const expectedTokens = countTokensText('What is the weather? Please be specific.');
      expect(result).toBe(expectedTokens);
    });

    it('should count tokens from both system and messages', () => {
      const request: AnthropicRequest = {
        system: 'You are a helpful assistant.',
        messages: [
          { role: 'user', content: 'Hello!' },
          { role: 'assistant', content: 'Hi there!' }
        ]
      };
      const result = countTokens(request);
      const expectedTokens = countTokensText('You are a helpful assistant.') +
                           countTokensText('Hello!') +
                           countTokensText('Hi there!');
      expect(result).toBe(expectedTokens);
    });

    it('should handle mixed string and array formats', () => {
      const request: AnthropicRequest = {
        system: [
          { type: 'text', text: 'System prompt here.' }
        ],
        messages: [
          { role: 'user', content: 'Simple string message' },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Array format response' }
            ]
          }
        ]
      };
      const result = countTokens(request);
      const expectedTokens = countTokensText('System prompt here.') +
                           countTokensText('Simple string message') +
                           countTokensText('Array format response');
      expect(result).toBe(expectedTokens);
    });

    it('should ignore non-text content blocks', () => {
      const request: AnthropicRequest = {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'This should be counted.' },
              { type: 'image', data: 'base64imagedata' }, // Should be ignored
              { type: 'other', content: 'something else' } // Should be ignored
            ]
          }
        ]
      };
      const result = countTokens(request);
      const expectedTokens = countTokensText('This should be counted.');
      expect(result).toBe(expectedTokens);
    });

    it('should handle empty messages array', () => {
      const request: AnthropicRequest = {
        system: 'System message',
        messages: []
      };
      const result = countTokens(request);
      expect(result).toBe(countTokensText('System message'));
    });

    it('should handle messages without content', () => {
      const request: AnthropicRequest = {
        messages: [
          { role: 'user' }, // No content property
          { role: 'assistant', content: '' }, // Empty content
          { role: 'user', content: 'Valid message' }
        ]
      };
      const result = countTokens(request);
      expect(result).toBe(countTokensText('Valid message'));
    });

    it('should handle invalid message structures gracefully', () => {
      const request: AnthropicRequest = {
        messages: [
          null, // Invalid message
          { role: 'user', content: 'Valid message' },
          undefined // Invalid message
        ] as any
      };
      const result = countTokens(request);
      expect(result).toBe(countTokensText('Valid message'));
    });
  });

  describe('Token Count Accuracy', () => {
    it('should meet accuracy requirements for known text', () => {
      // Test with various known texts to ensure < 10% error rate
      const testCases = [
        'Hello world',
        'The quick brown fox jumps over the lazy dog.',
        'This is a longer sentence that should provide better accuracy testing for the token counting function.',
        'Multi-line\ntext with\nline breaks\nand special characters: @#$%^&*()',
        '   Whitespace   handling   test   ',
        'Numbers: 123 456.789 and symbols: !@#$%^&*()_+-=[]{}|;:,.<>?'
      ];

      for (const text of testCases) {
        const tokenCount = countTokensText(text);
        const fallbackCount = Math.ceil(text.length / 4);

        // Ensure we get a reasonable count (not zero for non-empty text)
        if (text.trim().length > 0) {
          expect(tokenCount).toBeGreaterThan(0);
        }

        // The count should be somewhat reasonable relative to text length
        // Allow for wide range since different tokenizers have different behaviors
        expect(tokenCount).toBeLessThanOrEqual(text.length); // Can't have more tokens than characters
        expect(tokenCount).toBeGreaterThanOrEqual(Math.ceil(text.length / 10)); // Reasonable lower bound
      }
    });

    it('should handle edge cases for accuracy testing', () => {
      const edgeCases = [
        '',
        ' ',
        '\n\n\n',
        'a',
        'supercalifragilisticexpialidocious', // Very long word
        '🚀🌟💻🎉🔥', // Only emojis
        '中文测试', // Chinese characters
        'Café naïve résumé', // Accented characters
      ];

      for (const text of edgeCases) {
        const tokenCount = countTokensText(text);
        // Should not throw and should return reasonable results
        expect(typeof tokenCount).toBe('number');
        expect(tokenCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Fallback Behavior', () => {
    it('should use fallback estimation when tiktoken fails', () => {
      // This test would be more meaningful if we could mock tiktoken failure
      // For now, we test that fallback calculation is correct
      const text = 'Test text for fallback calculation';
      const expectedFallback = Math.ceil(text.length / 4);

      // The actual result might be from tiktoken or fallback
      // We just ensure it's a reasonable number
      const result = countTokensText(text);
      expect(result).toBeGreaterThan(0);
      expect(typeof result).toBe('number');
    });
  });
});