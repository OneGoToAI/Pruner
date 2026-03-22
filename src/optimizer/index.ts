// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Proprietary and confidential. Unauthorized use prohibited.

import { getConfig } from '../config.js';
import { injectPromptCache, ANTHROPIC_BETA_HEADER } from './cache.js';
import { pruneContext } from './pruner.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnthropicBody = Record<string, any>;

export interface OptimizeResult {
  body: AnthropicBody;
  extraHeaders: Record<string, string>;
  /** True when the client (e.g. Claude Code) already manages prompt caching */
  clientCacheDetected: boolean;
}

/**
 * Run all enabled optimizers in order:
 *   1. Prompt cache injection  (enablePromptCache)
 *   2. Context pruning         (enableContextPruning)
 *
 * Each step is wrapped in a try/catch so a bug in one optimizer never
 * breaks the proxy — availability always wins over compression ratio.
 */
export function optimize(body: AnthropicBody): OptimizeResult {
  const config = getConfig();
  const { optimizer } = config;

  let result = body;
  const extraHeaders: Record<string, string> = {};
  let clientCacheDetected = false;

  if (optimizer.enablePromptCache) {
    try {
      const cacheResult = injectPromptCache(result);
      result = cacheResult.body;
      clientCacheDetected = cacheResult.clientCacheDetected;
      if (result.__pruner_beta__) {
        extraHeaders[ANTHROPIC_BETA_HEADER] = result.__pruner_beta__;
        const { __pruner_beta__: _ignored, ...cleaned } = result;
        result = cleaned;
      }
    } catch (err) {
      process.stderr.write(`[Pruner] ⚠ prompt-cache optimizer failed, falling back: ${err}\n`);
      result = body;
    }
  }

  if (optimizer.enableContextPruning) {
    try {
      result = pruneContext(result, optimizer.maxMessages, optimizer.maxToolOutputChars);
    } catch (err) {
      process.stderr.write(`[Pruner] ⚠ context-pruning optimizer failed, falling back: ${err}\n`);
    }
  }

  return { body: result, extraHeaders, clientCacheDetected };
}
