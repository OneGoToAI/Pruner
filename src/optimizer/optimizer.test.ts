// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { describe, it, expect } from 'vitest';
import { truncateLargeContent } from './truncate.js';
import { injectPromptCache } from './cache.js';
import { pruneContext } from './pruner.js';

// ── truncate.ts ───────────────────────────────────────────────────────────────

describe('truncateLargeContent', () => {
  it('returns the string unchanged when within maxChars', () => {
    const s = 'hello world';
    expect(truncateLargeContent(s, 100)).toBe(s);
  });

  it('returns the string unchanged when exactly at maxChars', () => {
    const s = 'a'.repeat(100);
    expect(truncateLargeContent(s, 100)).toBe(s);
  });

  it('truncates and includes the marker when over maxChars', () => {
    const s = 'a'.repeat(2000);
    const result = truncateLargeContent(s, 1000);
    expect(result).toContain('[Pruner: content truncated');
    expect(result.length).toBeLessThan(s.length);
  });

  it('preserves the head of the content', () => {
    const head = 'HEAD_CONTENT_';
    const s = head + 'x'.repeat(3000);
    const result = truncateLargeContent(s, 1000);
    expect(result.startsWith(head)).toBe(true);
  });

  it('preserves the tail of the content', () => {
    const tail = '_TAIL_CONTENT';
    const s = 'x'.repeat(3000) + tail;
    const result = truncateLargeContent(s, 1000);
    expect(result.endsWith(tail)).toBe(true);
  });

  it('handles empty string', () => {
    expect(truncateLargeContent('', 100)).toBe('');
  });

  it('reports the correct number of dropped chars in the marker', () => {
    // maxChars=1000, TAIL_CHARS=500 → head=500, tail=500
    // total=2000 → dropped = 2000 - 500 - 500 = 1000
    const s = 'a'.repeat(2000);
    const result = truncateLargeContent(s, 1000);
    expect(result).toContain('1000 chars removed from middle');
  });
});

// ── cache.ts ──────────────────────────────────────────────────────────────────

// Build a string that exceeds 1024 tokens (~4100 chars with cl100k)
const LONG_SYSTEM = 'This is a detailed system prompt. '.repeat(150); // ~5100 chars → ~1275 tokens

describe('injectPromptCache', () => {
  it('returns body unchanged when no system prompt', () => {
    const body = { messages: [{ role: 'user', content: 'hi' }] };
    const { body: result, clientCacheDetected } = injectPromptCache(body);
    expect(result).toEqual(body);
    expect(clientCacheDetected).toBe(false);
  });

  it('does not inject when system prompt is too short (≤1024 tokens)', () => {
    const body = { system: 'Short prompt.', messages: [] };
    const { body: result, clientCacheDetected } = injectPromptCache(body);
    expect(result.system).toBe('Short prompt.');
    expect(result.__pruner_beta__).toBeUndefined();
    expect(clientCacheDetected).toBe(false);
  });

  it('injects cache_control when system prompt is large (>1024 tokens)', () => {
    const body = { system: LONG_SYSTEM, messages: [] };
    const { body: result, clientCacheDetected } = injectPromptCache(body);
    expect(clientCacheDetected).toBe(false);
    expect(result.__pruner_beta__).toBe('prompt-caching-2024-07-31');
    expect(Array.isArray(result.system)).toBe(true);
    const lastBlock = result.system[result.system.length - 1];
    expect(lastBlock.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('injects onto the last block when system is already an array', () => {
    const body = {
      system: [
        { type: 'text', text: 'First block. ' },
        { type: 'text', text: LONG_SYSTEM },
      ],
      messages: [],
    };
    const { body: result } = injectPromptCache(body);
    expect(result.system[0].cache_control).toBeUndefined();
    expect(result.system[1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('skips injection and sets clientCacheDetected when system already has cache_control', () => {
    const body = {
      system: [{ type: 'text', text: LONG_SYSTEM, cache_control: { type: 'ephemeral', ttl: '5m' } }],
      messages: [],
    };
    const { body: result, clientCacheDetected } = injectPromptCache(body);
    expect(clientCacheDetected).toBe(true);
    expect(result.__pruner_beta__).toBeUndefined();
    // Original system block is untouched
    expect(result.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '5m' });
  });

  it('detects cache_control in messages and skips injection', () => {
    const body = {
      system: LONG_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }],
        },
      ],
    };
    const { clientCacheDetected } = injectPromptCache(body);
    expect(clientCacheDetected).toBe(true);
  });

  it('detects cache_control in tools and skips injection', () => {
    const body = {
      system: LONG_SYSTEM,
      tools: [{ name: 'bash', cache_control: { type: 'ephemeral' } }],
      messages: [],
    };
    const { clientCacheDetected } = injectPromptCache(body);
    expect(clientCacheDetected).toBe(true);
  });
});

// ── pruner.ts ─────────────────────────────────────────────────────────────────

const makeMsg = (role: string, content: string) => ({ role, content });
const makeToolResultMsg = (toolContent: string) => ({
  role: 'user',
  content: [{ type: 'tool_result', tool_use_id: 'x', content: toolContent }],
});

describe('pruneContext — message cap', () => {
  it('returns body unchanged when messages ≤ maxMessages', () => {
    const messages = [makeMsg('user', 'a'), makeMsg('assistant', 'b')];
    const body = { messages };
    const result = pruneContext(body, 20, 3000);
    expect(result.messages).toHaveLength(2);
  });

  it('trims messages when over maxMessages, keeping first + placeholder + last N', () => {
    const messages = Array.from({ length: 25 }, (_, i) => makeMsg('user', `msg${i}`));
    const result = pruneContext({ messages }, 20, 3000);
    // first + placeholder + 19 recent = 21
    expect(result.messages).toHaveLength(21);
    // First message preserved
    expect(result.messages[0].content).toBe('msg0');
    // Second message is placeholder
    expect(result.messages[1].content).toContain('[Pruner:');
    expect(result.messages[1].content).toContain('omitted');
    // Last message preserved
    expect(result.messages[20].content).toBe('msg24');
  });

  it('always keeps the first message', () => {
    const messages = Array.from({ length: 30 }, (_, i) => makeMsg('user', `msg${i}`));
    const result = pruneContext({ messages }, 5, 3000);
    expect(result.messages[0].content).toBe('msg0');
  });

  it('placeholder contains correct omitted count', () => {
    // 10 messages, maxMessages=5 → keep first + 4 recent → drop 10-1-4 = 5
    const messages = Array.from({ length: 10 }, (_, i) => makeMsg('user', `msg${i}`));
    const result = pruneContext({ messages }, 5, 3000);
    expect(result.messages[1].content).toContain('5 messages omitted');
  });

  it('returns body unchanged when messages field is missing', () => {
    const body = { system: 'sys' };
    const result = pruneContext(body, 20, 3000);
    expect(result).toEqual(body);
  });
});

describe('pruneContext — tool result truncation', () => {
  it('truncates long tool_result string content', () => {
    const longOutput = 'x'.repeat(5000);
    const messages = [makeToolResultMsg(longOutput)];
    const result = pruneContext({ messages }, 20, 3000);
    const block = result.messages[0].content[0];
    expect(block.content.length).toBeLessThan(longOutput.length);
    expect(block.content).toContain('[Pruner: truncated');
  });

  it('leaves short tool_result content untouched', () => {
    const shortOutput = 'hello world';
    const messages = [makeToolResultMsg(shortOutput)];
    const result = pruneContext({ messages }, 20, 3000);
    expect(result.messages[0].content[0].content).toBe(shortOutput);
  });

  it('truncates tool_result with array content (text blocks)', () => {
    const longText = 'y'.repeat(5000);
    const messages = [{
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: 'x',
        content: [{ type: 'text', text: longText }],
      }],
    }];
    const result = pruneContext({ messages }, 20, 3000);
    const inner = result.messages[0].content[0].content[0];
    expect(inner.text.length).toBeLessThan(longText.length);
    expect(inner.text).toContain('[Pruner: truncated');
  });

  it('does not touch non-tool_result blocks', () => {
    const messages = [{
      role: 'user',
      content: [{ type: 'text', text: 'normal message' }],
    }];
    const result = pruneContext({ messages }, 20, 3000);
    expect(result.messages[0].content[0].text).toBe('normal message');
  });
});

describe('pruneContext — assistant history trimming', () => {
  it('trims long assistant messages in history (not the last)', () => {
    const longContent = 'z'.repeat(6000);
    const messages = [
      makeMsg('user', 'question'),
      makeMsg('assistant', longContent),  // history — should be trimmed
      makeMsg('user', 'follow-up'),
      makeMsg('assistant', 'short reply'), // last — should NOT be trimmed
    ];
    const result = pruneContext({ messages }, 20, 3000);
    // History assistant message is trimmed
    expect(result.messages[1].content.length).toBeLessThan(longContent.length);
    expect(result.messages[1].content).toContain('[Pruner: content truncated');
    // Last assistant message is untouched
    expect(result.messages[3].content).toBe('short reply');
  });

  it('does not trim the last message even if it is a long assistant message', () => {
    const longContent = 'z'.repeat(6000);
    const messages = [
      makeMsg('user', 'question'),
      makeMsg('assistant', longContent), // last message
    ];
    const result = pruneContext({ messages }, 20, 3000);
    expect(result.messages[1].content).toBe(longContent);
  });

  it('trims assistant messages with array content blocks', () => {
    const longText = 'z'.repeat(6000);
    const messages = [
      { role: 'assistant', content: [{ type: 'text', text: longText }] },
      makeMsg('user', 'next question'),
    ];
    const result = pruneContext({ messages }, 20, 3000);
    const block = result.messages[0].content[0];
    expect(block.text.length).toBeLessThan(longText.length);
  });

  it('leaves short assistant messages untouched', () => {
    const messages = [
      makeMsg('assistant', 'short reply'),
      makeMsg('user', 'follow-up'),
    ];
    const result = pruneContext({ messages }, 20, 3000);
    expect(result.messages[0].content).toBe('short reply');
  });
});
