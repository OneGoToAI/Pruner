// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Proprietary and confidential. Unauthorized use prohibited.

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
