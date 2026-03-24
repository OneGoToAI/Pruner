// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { describe, it, expect } from 'vitest';
import { truncateLargeContent } from './truncate.js';
import { injectPromptCache } from './cache.js';
import { pruneContext } from './pruner.js';
import { deduplicateToolResults } from './dedup.js';
import { summarizeDroppedMessages } from './summarizer.js';

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
const makeToolUseMsg = (id: string, name = 'bash', input = { command: 'ls' }) => ({
  role: 'assistant',
  content: [{ type: 'tool_use', id, name, input }],
});
const makeToolResultMsgWithId = (id: string, output: string) => ({
  role: 'user',
  content: [{ type: 'tool_result', tool_use_id: id, content: output }],
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

describe('pruneContext — tool_use/tool_result pair preservation', () => {
  it('keeps tool_use assistant message when its tool_result is at the cut boundary', () => {
    // Build a conversation where the cut boundary falls on a user message with tool_result.
    // messages[0]: user, [1..8]: alternating assistant/user, [9]: assistant(tool_use), [10]: user(tool_result), [11..end]: recent
    const messages: Record<string, unknown>[] = [
      makeMsg('user', 'initial question'),
    ];
    for (let i = 1; i <= 8; i++) {
      messages.push(makeMsg(i % 2 === 1 ? 'assistant' : 'user', `msg${i}`));
    }
    messages.push(makeToolUseMsg('tool_A'));       // [9]  assistant with tool_use
    messages.push(makeToolResultMsgWithId('tool_A', 'result A')); // [10] user with tool_result
    for (let i = 11; i <= 14; i++) {
      messages.push(makeMsg(i % 2 === 1 ? 'assistant' : 'user', `msg${i}`));
    }
    // 15 messages total, maxMessages=7 → initial cutStart = 15 - 6 = 9
    // messages[9] is assistant (tool_use) — not a tool_result user, so no shift needed
    // But if maxMessages=6 → cutStart = 15 - 5 = 10 → messages[10] is user (tool_result)
    // Should expand back to include messages[9] (assistant with tool_use)
    const result = pruneContext({ messages }, 6, 3000);

    // The tool_use assistant message should be in the result
    const hasToolUse = result.messages.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => Array.isArray(m.content) && m.content.some((b: any) => b.type === 'tool_use' && b.id === 'tool_A'),
    );
    const hasToolResult = result.messages.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => Array.isArray(m.content) && m.content.some((b: any) => b.type === 'tool_result' && b.tool_use_id === 'tool_A'),
    );
    expect(hasToolUse).toBe(true);
    expect(hasToolResult).toBe(true);
  });

  it('handles consecutive tool pairs at the cut boundary', () => {
    const messages: Record<string, unknown>[] = [
      makeMsg('user', 'initial'),
      makeMsg('assistant', 'filler1'),
      makeMsg('user', 'filler2'),
      makeMsg('assistant', 'filler3'),
      makeMsg('user', 'filler4'),
      makeMsg('assistant', 'filler5'),
      makeMsg('user', 'filler6'),
      makeToolUseMsg('tool_X'),                          // [7]
      makeToolResultMsgWithId('tool_X', 'result X'),     // [8]
      makeToolUseMsg('tool_Y'),                          // [9]
      makeToolResultMsgWithId('tool_Y', 'result Y'),     // [10]
      makeMsg('assistant', 'final answer'),              // [11]
      makeMsg('user', 'thanks'),                         // [12]
    ];
    // 13 messages, maxMessages=4 → cutStart = 13 - 3 = 10
    // messages[10] is user (tool_result Y) → expand to 9
    // messages[9] is assistant (tool_use Y) → not tool_result, stop
    const result = pruneContext({ messages }, 4, 3000);

    const hasToolY = result.messages.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => Array.isArray(m.content) && m.content.some((b: any) => b.id === 'tool_Y'),
    );
    const hasToolYResult = result.messages.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => Array.isArray(m.content) && m.content.some((b: any) => b.tool_use_id === 'tool_Y'),
    );
    expect(hasToolY).toBe(true);
    expect(hasToolYResult).toBe(true);
  });

  it('does not break when all messages are tool pairs and nothing can be pruned', () => {
    const messages: Record<string, unknown>[] = [
      makeMsg('user', 'start'),
      makeToolUseMsg('t1'),
      makeToolResultMsgWithId('t1', 'r1'),
      makeToolUseMsg('t2'),
      makeToolResultMsgWithId('t2', 'r2'),
    ];
    // 5 messages, maxMessages=3 → cutStart = 5 - 2 = 3
    // messages[3] is assistant (tool_use t2), not tool_result → stop
    // But messages[4] is user (tool_result t2), and messages[3] is kept, so pair is intact
    const result = pruneContext({ messages }, 3, 3000);
    expect(result.messages.length).toBeGreaterThanOrEqual(3);
  });
});

describe('pruneContext — tool result truncation', () => {
  it('truncates long tool_result string content using head-tail strategy', () => {
    const longOutput = 'x'.repeat(5000);
    const messages = [makeToolResultMsg(longOutput)];
    const result = pruneContext({ messages }, 20, 3000);
    const block = result.messages[0].content[0];
    expect(block.content.length).toBeLessThan(longOutput.length);
    expect(block.content).toContain('[Pruner: content truncated');
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
    expect(inner.text).toContain('[Pruner: content truncated');
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

describe('pruneContext — tool-specific truncation', () => {
  it('applies different truncation limits based on tool type', () => {
    const messages = [
      makeToolUseMsg('read1', 'Read', { path: 'file.txt' } as any),
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'read1', content: 'x'.repeat(2000) }],
      },
      makeToolUseMsg('grep1', 'Grep', { pattern: 'test' } as any),
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'grep1', content: 'y'.repeat(2000) }],
      },
    ];

    const result = pruneContext({ messages }, 20, 3000);
    
    // Read tool_result should be truncated to ~1500 chars (head-tail)
    const readResult = result.messages[1].content[0];
    expect(readResult.content.length).toBeLessThan(2000);
    expect(readResult.content.length).toBeGreaterThan(1000);
    
    // Grep tool_result should be truncated to ~1000 chars (head-only)
    const grepResult = result.messages[3].content[0];
    expect(grepResult.content.length).toBeLessThan(1500);
    expect(grepResult.content.length).toBeGreaterThan(500);
  });

  it('uses fallback limit when tool name cannot be determined', () => {
    const messages = [
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'unknown', content: 'x'.repeat(5000) }],
      },
    ];

    const result = pruneContext({ messages }, 20, 3000);
    const toolResult = result.messages[0].content[0];
    
    // Should use fallback limit of 3000 chars (head-tail strategy adds some overhead)
    expect(toolResult.content.length).toBeLessThan(3500);
    expect(toolResult.content.length).toBeGreaterThan(2500);
  });
});

describe('pruneContext — structured summaries', () => {
  it('generates structured summary when messages are dropped', () => {
    const messages = Array.from({ length: 15 }, (_, i) => 
      i % 2 === 0 
        ? makeMsg('user', `user message ${i}`)
        : makeMsg('assistant', `assistant message ${i}`)
    );

    const result = pruneContext({ messages }, 4, 3000);
    
    // With 15 messages and maxMessages=4, some should be dropped and summarized
    expect(result.messages.length).toBeLessThan(messages.length);
    
    // Should contain a summary message
    const hasSummary = result.messages.some((m: any) => 
      typeof m.content === 'string' && m.content.includes('[Pruner context summary')
    );
    expect(hasSummary).toBe(true);
  });

  it('handles empty dropped messages gracefully', () => {
    const messages = [makeMsg('user', 'hello'), makeMsg('assistant', 'hi')];
    const result = pruneContext({ messages }, 5, 3000);
    
    // No messages should be dropped
    expect(result.messages).toHaveLength(2);
  });
});

describe('pruneContext — distance decay', () => {
  it('applies more aggressive truncation to older assistant messages', () => {
    const longContent = 'z'.repeat(6000);
    const messages = [
      makeMsg('user', 'start'),
      makeMsg('assistant', longContent),  // Very old - should be truncated to ~800 chars
      makeMsg('user', 'continue'),
      makeMsg('assistant', longContent),  // Old - should be truncated to ~1500 chars  
      makeMsg('user', 'more'),
      makeMsg('assistant', longContent),  // Recent - should be truncated to ~3000 chars
      makeMsg('user', 'final'),
      makeMsg('assistant', longContent),  // Last - should NOT be truncated
    ];

    const result = pruneContext({ messages }, 20, 3000);
    
    // Very old message (index 1) - most aggressive truncation
    // Age = 8 - 1 - 1 = 6, which is > 10, so gets 800 chars + head-tail overhead
    expect(result.messages[1].content.length).toBeLessThan(1600);
    expect(result.messages[1].content.length).toBeGreaterThan(700);
    
    // Old message (index 3) - moderate truncation
    // Age = 8 - 1 - 3 = 4, which is <= 5, so gets 3000 chars
    expect(result.messages[3].content.length).toBeLessThan(4000);
    expect(result.messages[3].content.length).toBeGreaterThan(2500);
    
    // Recent message (index 5) - light truncation  
    // Age = 8 - 1 - 5 = 2, which is <= 2, so gets full 5000 chars
    expect(result.messages[5].content.length).toBeLessThan(6000);
    expect(result.messages[5].content.length).toBeGreaterThan(4500);
    
    // Last message (index 7) - no truncation
    expect(result.messages[7].content).toBe(longContent);
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

// ── dedup.ts ──────────────────────────────────────────────────────────────────

describe('deduplicateToolResults — file read dedup', () => {
  it('deduplicates repeated reads of the same file', () => {
    const messages = [
      // First read of src/proxy.ts
      makeToolUseMsg('r1', 'Read', { path: 'src/proxy.ts' } as any),
      makeToolResultMsgWithId('r1', 'original file content here...'),
      // Some work in between
      makeMsg('assistant', 'I see the issue'),
      makeMsg('user', 'fix it'),
      // Second read of src/proxy.ts (newer)
      makeToolUseMsg('r2', 'Read', { path: 'src/proxy.ts' } as any),
      makeToolResultMsgWithId('r2', 'updated file content here...'),
    ];

    const result = deduplicateToolResults(messages);

    // First read result should be replaced with a reference
    const firstResult = result[1].content[0];
    expect(firstResult.content).toContain('deduplicated');
    expect(firstResult.content).toContain('src/proxy.ts');

    // Second read result should be preserved
    const secondResult = result[5].content[0];
    expect(secondResult.content).toBe('updated file content here...');
  });

  it('does not dedup different files', () => {
    const messages = [
      makeToolUseMsg('r1', 'Read', { path: 'src/a.ts' } as any),
      makeToolResultMsgWithId('r1', 'file A content'),
      makeToolUseMsg('r2', 'Read', { path: 'src/b.ts' } as any),
      makeToolResultMsgWithId('r2', 'file B content'),
    ];

    const result = deduplicateToolResults(messages);

    expect(result[1].content[0].content).toBe('file A content');
    expect(result[3].content[0].content).toBe('file B content');
  });

  it('handles three reads of the same file — keeps only the last', () => {
    const messages = [
      makeToolUseMsg('r1', 'Read', { path: 'foo.ts' } as any),
      makeToolResultMsgWithId('r1', 'version 1'),
      makeToolUseMsg('r2', 'Read', { path: 'foo.ts' } as any),
      makeToolResultMsgWithId('r2', 'version 2'),
      makeToolUseMsg('r3', 'Read', { path: 'foo.ts' } as any),
      makeToolResultMsgWithId('r3', 'version 3'),
    ];

    const result = deduplicateToolResults(messages);

    // First two should be deduped
    expect(result[1].content[0].content).toContain('deduplicated');
    expect(result[3].content[0].content).toContain('deduplicated');
    // Third should be preserved
    expect(result[5].content[0].content).toBe('version 3');
  });
});

describe('deduplicateToolResults — command output dedup', () => {
  it('deduplicates repeated git status commands', () => {
    const messages = [
      makeToolUseMsg('s1', 'Bash', { command: 'git status' }),
      makeToolResultMsgWithId('s1', 'On branch main\nnothing to commit'),
      makeMsg('assistant', 'looks clean'),
      makeMsg('user', 'now check again'),
      makeToolUseMsg('s2', 'Bash', { command: 'git status' }),
      makeToolResultMsgWithId('s2', 'On branch main\n1 file changed'),
    ];

    const result = deduplicateToolResults(messages);

    // First result should be deduped
    expect(result[1].content[0].content).toContain('deduplicated');
    // Second should be preserved
    expect(result[5].content[0].content).toBe('On branch main\n1 file changed');
  });

  it('does not dedup non-idempotent commands', () => {
    const messages = [
      makeToolUseMsg('s1', 'Bash', { command: 'npm install' }),
      makeToolResultMsgWithId('s1', 'installed 500 packages'),
      makeToolUseMsg('s2', 'Bash', { command: 'npm install' }),
      makeToolResultMsgWithId('s2', 'installed 501 packages'),
    ];

    const result = deduplicateToolResults(messages);

    // Both should be preserved (npm install is not idempotent)
    expect(result[1].content[0].content).toBe('installed 500 packages');
    expect(result[3].content[0].content).toBe('installed 501 packages');
  });

  it('returns messages unchanged when no duplicates exist', () => {
    const messages = [
      makeToolUseMsg('r1', 'Read', { path: 'a.ts' } as any),
      makeToolResultMsgWithId('r1', 'content A'),
      makeToolUseMsg('s1', 'Bash', { command: 'git status' }),
      makeToolResultMsgWithId('s1', 'clean'),
    ];

    const result = deduplicateToolResults(messages);
    expect(result[1].content[0].content).toBe('content A');
    expect(result[3].content[0].content).toBe('clean');
  });
});

describe('summarizeDroppedMessages — edge cases', () => {
  it('handles messages with mixed content types', () => {
    const messages = [
      makeMsg('user', 'fix the authentication bug in the login module'),
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I found the issue in the auth module.' },
          { type: 'tool_use', id: 'r1', name: 'Read', input: { path: 'src/auth.ts' } },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'r1', content: 'export function login() { ... }' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'The problem is fixed now.' },
          { type: 'tool_use', id: 'w1', name: 'Write', input: { path: 'src/auth.ts' } },
        ],
      },
    ];

    const summary = summarizeDroppedMessages(messages);
    expect(summary).toContain('[Pruner context summary');
    expect(summary).toContain('authentication bug');
    expect(summary).toContain('→ read src/auth.ts');
    expect(summary).toContain('→ wrote src/auth.ts');
  });

  it('returns generic message for empty input', () => {
    const summary = summarizeDroppedMessages([]);
    expect(summary).toContain('no messages to summarize');
  });
});
