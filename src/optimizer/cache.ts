// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { countTokensText } from '../stats/counter.js';

const CACHE_BETA_HEADER = 'prompt-caching-2024-07-31';
const MIN_TOKENS_FOR_CACHE = 1024;
const MIN_MESSAGES_FOR_HISTORY_CACHE = 4;
const HISTORY_CACHE_OFFSET_FROM_END = 4;

interface TextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: string; ttl?: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnthropicBody = Record<string, any>;

/**
 * Check whether the request already contains any cache_control blocks
 * in system or tools. Claude Code CLI manages its own prompt caching
 * on system/tools with specific TTLs.
 *
 * We intentionally do NOT check messages — Pruner injects its own
 * message-level cache breakpoints, which are complementary to the
 * client's system/tools caching.
 */
function hasSystemOrToolsCacheControl(body: AnthropicBody): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const check = (val: any): boolean => {
    if (!val || typeof val !== 'object') return false;
    if (Array.isArray(val)) return val.some(check);
    if (val.cache_control) return true;
    return Object.values(val).some(check);
  };
  return check(body.tools) || check(body.system);
}

/**
 * Check if messages already have cache_control (from Claude Code or a previous pass).
 */
function messagesHaveCacheControl(body: AnthropicBody): boolean {
  if (!Array.isArray(body.messages)) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const check = (val: any): boolean => {
    if (!val || typeof val !== 'object') return false;
    if (Array.isArray(val)) return val.some(check);
    if (val.cache_control) return true;
    return Object.values(val).some(check);
  };
  return check(body.messages);
}

/**
 * Inject Anthropic prompt-caching cache_control into the system prompt
 * when it is large enough to benefit from caching (> 1024 tokens).
 *
 * When the client already manages system/tools caching (e.g. Claude Code),
 * we skip system injection — but still inject message-level breakpoints.
 *
 * Ref: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export function injectPromptCache(body: AnthropicBody): { body: AnthropicBody; clientCacheDetected: boolean } {
  let result = body;
  const clientCacheDetected = hasSystemOrToolsCacheControl(body);

  // System prompt cache injection (skip if client already manages it)
  if (!clientCacheDetected && body.system) {
    result = injectSystemCache(result);
  }

  // Message history cache injection (always apply — complementary to client caching)
  result = injectMessageHistoryCache(result);

  const needsBeta = result !== body;
  if (needsBeta && !result.__pruner_beta__) {
    result = { ...result, __pruner_beta__: CACHE_BETA_HEADER };
  }

  return { body: result, clientCacheDetected };
}

/**
 * Inject cache_control on the last system prompt block.
 */
function injectSystemCache(body: AnthropicBody): AnthropicBody {
  if (!body.system) return body;

  let blocks: TextBlock[];
  if (typeof body.system === 'string') {
    blocks = [{ type: 'text', text: body.system }];
  } else if (Array.isArray(body.system)) {
    blocks = body.system as TextBlock[];
  } else {
    return body;
  }

  const totalTokens = blocks.reduce(
    (sum, b) => sum + (b.text ? countTokensText(b.text) : 0),
    0,
  );

  if (totalTokens <= MIN_TOKENS_FOR_CACHE) return body;

  const patched = blocks.map((b, i) =>
    i === blocks.length - 1
      ? { ...b, cache_control: { type: 'ephemeral' as const } }
      : b,
  );

  return { ...body, system: patched, __pruner_beta__: CACHE_BETA_HEADER };
}

/**
 * Inject a cache breakpoint on conversation history messages.
 *
 * Strategy: Place cache_control on a message ~4 positions from the end.
 * The messages before the breakpoint are stable across consecutive requests
 * (they were present in the previous request too), so Anthropic can serve
 * them from cache at 1/10 the price ($0.30/M vs $3.00/M).
 *
 * Only the last few messages (new since the previous request) are billed
 * at full input price. This is completely lossless — no content is modified.
 */
function injectMessageHistoryCache(body: AnthropicBody): AnthropicBody {
  if (!Array.isArray(body.messages)) return body;
  if (body.messages.length < MIN_MESSAGES_FOR_HISTORY_CACHE) return body;
  if (messagesHaveCacheControl(body)) return body;

  // Place breakpoint on a user or assistant message near the end.
  // We go HISTORY_CACHE_OFFSET_FROM_END messages back from the end.
  const breakpointIdx = Math.max(0, body.messages.length - HISTORY_CACHE_OFFSET_FROM_END);

  const messages = body.messages.map((msg: any, idx: number) => {
    if (idx !== breakpointIdx) return msg;
    return injectCacheOnMessage(msg);
  });

  return { ...body, messages };
}

/**
 * Add cache_control to the last content block of a message.
 * Works for both string and array content formats.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectCacheOnMessage(msg: any): any {
  if (typeof msg.content === 'string') {
    return {
      ...msg,
      content: [
        { type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } },
      ],
    };
  }

  if (Array.isArray(msg.content) && msg.content.length > 0) {
    const lastIdx = msg.content.length - 1;
    const content = msg.content.map((block: any, i: number) => {
      if (i !== lastIdx) return block;
      if (block.cache_control) return block;
      return { ...block, cache_control: { type: 'ephemeral' } };
    });
    return { ...msg, content };
  }

  return msg;
}

export const ANTHROPIC_BETA_HEADER = 'anthropic-beta';
export { CACHE_BETA_HEADER };
