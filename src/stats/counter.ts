// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { request as undiciRequest } from 'undici';
import { get_encoding, type Tiktoken } from 'tiktoken';

let encoder: Tiktoken | null = null;
let encoderFailed = false;

function getEncoder(): Tiktoken | null {
  if (encoderFailed) return null;
  if (encoder) return encoder;
  try {
    encoder = get_encoding('cl100k_base');
    return encoder;
  } catch (err) {
    process.stderr.write(`[Pruner] tiktoken init failed, falling back to char estimation: ${err}\n`);
    encoderFailed = true;
    return null;
  }
}

export function countTokensText(text: string): number {
  const enc = getEncoder();
  if (enc) {
    return enc.encode(text).length;
  }
  // Fallback: ~4 chars per token (rough estimate, error < 20%)
  return Math.ceil(text.length / 4);
}

/**
 * Call Anthropic's /v1/messages/count_tokens endpoint to get an exact token
 * count for the given request body.  This runs in parallel with the main
 * request so it adds zero latency to the user's Claude session.
 *
 * Returns null on any error (network failure, 4xx, etc.) so callers can fall
 * back to the tiktoken estimate without disrupting the proxy.
 *
 * @param body     The original (pre-optimization) request body
 * @param headers  Auth headers from the incoming request (x-api-key / authorization,
 *                 anthropic-version, anthropic-beta) so we can authenticate to Anthropic
 */
export async function fetchExactTokenCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  headers: Record<string, string>,
): Promise<number | null> {
  try {
    // Build a minimal body: model + messages + system only (no stream, no max_tokens)
    // The count_tokens endpoint requires model and messages, ignores generation params.
    const countBody: Record<string, unknown> = { model: body.model, messages: body.messages };
    if (body.system !== undefined) countBody.system = body.system;
    if (body.tools !== undefined) countBody.tools = body.tools;

    const countHeaders: Record<string, string> = { 'content-type': 'application/json' };
    for (const key of ['x-api-key', 'authorization', 'anthropic-version', 'anthropic-beta']) {
      const val = headers[key] ?? headers[key.toLowerCase()];
      if (val) countHeaders[key] = val;
    }

    const response = await undiciRequest(
      'https://api.anthropic.com/v1/messages/count_tokens',
      {
        method: 'POST',
        headers: countHeaders,
        body: JSON.stringify(countBody),
        headersTimeout: 8_000,
        bodyTimeout: 8_000,
      },
    );

    if (response.statusCode !== 200) return null;
    const text = await response.body.text();
    const json = JSON.parse(text) as { input_tokens?: number };
    return typeof json.input_tokens === 'number' ? json.input_tokens : null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function countTokens(body: any): number {
  let total = 0;

  if (body.system) {
    if (typeof body.system === 'string') {
      total += countTokensText(body.system);
    } else if (Array.isArray(body.system)) {
      for (const block of body.system) {
        if (block.text) total += countTokensText(String(block.text));
      }
    }
  }

  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (typeof msg.content === 'string') {
        total += countTokensText(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.text) total += countTokensText(String(block.text));
          if (block.type === 'tool_result') {
            if (typeof block.content === 'string') {
              total += countTokensText(block.content);
            } else if (Array.isArray(block.content)) {
              for (const c of block.content) {
                if (c.text) total += countTokensText(String(c.text));
              }
            }
          }
          if (block.type === 'tool_use' && block.input) {
            total += countTokensText(JSON.stringify(block.input));
          }
        }
      }
    }
  }

  return total;
}
