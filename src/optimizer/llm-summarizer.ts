// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { request as undiciRequest } from 'undici';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { getConfigDir } from '../config.js';
import { summarizeDroppedMessages } from './summarizer.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Message = Record<string, any>;

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const SUMMARIZE_MODEL = 'claude-3-5-haiku-latest';
const SUMMARIZE_TIMEOUT = 10_000;
const MAX_INPUT_CHARS_FOR_SUMMARY = 30_000;

let authHeadersCache: Record<string, string> | null = null;

/**
 * Store auth headers captured from the first proxied request.
 * Called by the proxy handler so the LLM summarizer can authenticate.
 */
export function setAuthHeaders(headers: Record<string, string>): void {
  if (!authHeadersCache) {
    authHeadersCache = { ...headers };
  }
}

/**
 * Get the cached summary for a given set of messages, or null if not cached.
 */
function getCachedSummary(cacheKey: string): string | null {
  const cacheDir = getSummaryCacheDir();
  const cachePath = join(cacheDir, `${cacheKey}.txt`);
  
  if (existsSync(cachePath)) {
    try {
      return readFileSync(cachePath, 'utf-8');
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Save a summary to the disk cache.
 */
function saveSummaryToCache(cacheKey: string, summary: string): void {
  const cacheDir = getSummaryCacheDir();
  try {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    writeFileSync(join(cacheDir, `${cacheKey}.txt`), summary, 'utf-8');
  } catch {
    // Cache write failures are non-critical
  }
}

function getSummaryCacheDir(): string {
  return join(getConfigDir(), 'summaries');
}

/**
 * Generate a cache key from message content.
 * Uses a hash of the first and last message content + message count.
 */
function generateCacheKey(messages: Message[]): string {
  const parts: string[] = [
    String(messages.length),
    messages[0]?.role || '',
    typeof messages[0]?.content === 'string' 
      ? messages[0].content.slice(0, 200) 
      : JSON.stringify(messages[0]?.content).slice(0, 200),
  ];
  
  if (messages.length > 1) {
    const last = messages[messages.length - 1];
    parts.push(
      last?.role || '',
      typeof last?.content === 'string'
        ? last.content.slice(0, 200)
        : JSON.stringify(last?.content).slice(0, 200),
    );
  }
  
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

/**
 * Convert messages to a compact text representation for the summarization prompt.
 */
function messagesToText(messages: Message[]): string {
  const lines: string[] = [];
  let totalChars = 0;

  for (const msg of messages) {
    if (totalChars >= MAX_INPUT_CHARS_FOR_SUMMARY) {
      lines.push(`... (${messages.length - lines.length} more messages truncated for summarization)`);
      break;
    }

    const role = msg.role || 'unknown';
    let content = '';

    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      const parts: string[] = [];
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          parts.push(block.text);
        } else if (block.type === 'tool_use') {
          const name = block.name || 'unknown';
          const inputStr = JSON.stringify(block.input || {});
          const shortInput = inputStr.length > 150 ? inputStr.slice(0, 150) + '...' : inputStr;
          parts.push(`[tool: ${name}(${shortInput})]`);
        } else if (block.type === 'tool_result') {
          const resultContent = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content);
          const shortResult = resultContent.length > 300 ? resultContent.slice(0, 300) + '...' : resultContent;
          parts.push(`[tool_result: ${shortResult}]`);
        }
      }
      content = parts.join('\n');
    }

    // Truncate individual messages to keep total size manageable
    if (content.length > 2000) {
      content = content.slice(0, 1800) + `\n... (${content.length - 1800} chars truncated)`;
    }

    lines.push(`[${role}]: ${content}`);
    totalChars += content.length;
  }

  return lines.join('\n\n');
}

const SUMMARIZE_SYSTEM_PROMPT = `You are a conversation summarizer for an AI coding assistant. Your job is to create a concise summary of a dropped portion of a conversation between a user and Claude (an AI assistant).

The summary should:
1. Preserve ALL user instructions and questions (these are critical)
2. List files that were read, written, or modified (with paths)
3. Note key decisions, errors encountered, and their resolutions
4. Mention any important context that the AI might need for subsequent turns
5. Be factual and compact — no filler words

Format the summary as a bulleted list. Keep it under 500 words.`;

/**
 * Call Claude Haiku to generate a high-quality summary of dropped messages.
 * Returns null on failure (callers should fall back to rule-based summary).
 */
async function callLlmForSummary(messages: Message[]): Promise<string | null> {
  if (!authHeadersCache) return null;

  const conversationText = messagesToText(messages);
  if (conversationText.length < 100) return null;

  try {
    const requestBody = {
      model: SUMMARIZE_MODEL,
      max_tokens: 1024,
      system: SUMMARIZE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Summarize the following dropped conversation segment (${messages.length} messages). Focus on what was done, what was decided, and what context is needed going forward:\n\n${conversationText}`,
        },
      ],
    };

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    for (const key of ['x-api-key', 'authorization', 'anthropic-version']) {
      const val = authHeadersCache[key] ?? authHeadersCache[key.toLowerCase()];
      if (val) headers[key] = val;
    }

    const response = await undiciRequest(`${ANTHROPIC_API_BASE}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      headersTimeout: SUMMARIZE_TIMEOUT,
      bodyTimeout: SUMMARIZE_TIMEOUT,
    });

    if (response.statusCode !== 200) {
      return null;
    }

    const text = await response.body.text();
    const json = JSON.parse(text);

    // Extract text from response
    if (Array.isArray(json.content)) {
      const textBlocks = json.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text);
      if (textBlocks.length > 0) {
        return textBlocks.join('\n');
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Three-tier summary generation with async LLM enhancement:
 *
 * Tier 1 (immediate): Rule-based summary from summarizer.ts — zero latency
 * Tier 2 (cached):    LLM-generated summary from previous run — zero latency
 * Tier 3 (async):     Fire LLM call in background, cache result for next request
 *
 * This function always returns immediately (Tier 1 or 2).
 * The LLM call runs in the background and caches its result for future use.
 */
export function generateSmartSummary(droppedMessages: Message[]): string {
  const cacheKey = generateCacheKey(droppedMessages);

  // Tier 2: Check for cached LLM summary from a previous request
  const cached = getCachedSummary(cacheKey);
  if (cached) {
    return `[Pruner AI summary (${droppedMessages.length} messages compressed):\n${cached}]`;
  }

  // Tier 3: Fire LLM summarization in background (result cached for next request)
  fireLlmSummaryInBackground(droppedMessages, cacheKey);

  // Tier 1: Return rule-based summary immediately (zero latency)
  return summarizeDroppedMessages(droppedMessages);
}

/**
 * Fire an LLM summarization call in the background.
 * The result is cached to disk for use in subsequent requests.
 */
function fireLlmSummaryInBackground(messages: Message[], cacheKey: string): void {
  // Don't await — this runs completely in the background
  callLlmForSummary(messages)
    .then((summary) => {
      if (summary) {
        saveSummaryToCache(cacheKey, summary);
      }
    })
    .catch(() => {
      // Background failures are silent
    });
}
