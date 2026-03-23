// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { countTokensText } from '../stats/counter.js';

const CACHE_BETA_HEADER = 'prompt-caching-2024-07-31';
const MIN_TOKENS_FOR_CACHE = 1024;

interface TextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: string; ttl?: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnthropicBody = Record<string, any>;

/**
 * Check whether the request already contains any cache_control blocks
 * (in tools, system, or messages). Claude Code CLI manages its own
 * prompt caching with specific TTLs — injecting ours would conflict.
 */
function hasCacheControl(body: AnthropicBody): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const check = (val: any): boolean => {
    if (!val || typeof val !== 'object') return false;
    if (Array.isArray(val)) return val.some(check);
    if (val.cache_control) return true;
    // Recurse into all object values to catch cache_control on nested content blocks
    return Object.values(val).some(check);
  };
  return check(body.tools) || check(body.system) || check(body.messages);
}

/**
 * Inject Anthropic prompt-caching cache_control into the system prompt
 * when it is large enough to benefit from caching (> 1024 tokens).
 *
 * When the client already manages caching (e.g. Claude Code with its
 * own TTLs), we skip injection entirely — the real savings from those
 * cache hits are tracked separately via response usage data (PRI-28).
 *
 * Ref: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export function injectPromptCache(body: AnthropicBody): { body: AnthropicBody; clientCacheDetected: boolean } {
  if (!body.system) return { body, clientCacheDetected: false };

  if (hasCacheControl(body)) {
    return { body, clientCacheDetected: true };
  }

  let blocks: TextBlock[];
  if (typeof body.system === 'string') {
    blocks = [{ type: 'text', text: body.system }];
  } else if (Array.isArray(body.system)) {
    blocks = body.system as TextBlock[];
  } else {
    return { body, clientCacheDetected: false };
  }

  const totalTokens = blocks.reduce(
    (sum, b) => sum + (b.text ? countTokensText(b.text) : 0),
    0,
  );

  if (totalTokens <= MIN_TOKENS_FOR_CACHE) return { body, clientCacheDetected: false };

  const patched = blocks.map((b, i) =>
    i === blocks.length - 1
      ? { ...b, cache_control: { type: 'ephemeral' as const } }
      : b,
  );

  return {
    body: { ...body, system: patched, __pruner_beta__: CACHE_BETA_HEADER },
    clientCacheDetected: false,
  };
}

export const ANTHROPIC_BETA_HEADER = 'anthropic-beta';
export { CACHE_BETA_HEADER };
