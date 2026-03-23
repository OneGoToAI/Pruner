// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

const TAIL_CHARS = 500;
const MARKER_TEMPLATE = (n: number) =>
  `\n... [Pruner: content truncated, ${n} chars removed from middle] ...\n`;

/**
 * Truncate a large string while preserving the head and tail.
 *
 * Strategy:
 *   - Keep the first (maxChars - TAIL_CHARS) characters (the "head")
 *   - Keep the last TAIL_CHARS characters (the "tail")
 *   - Replace the middle with a human-readable marker
 *
 * If content is already within maxChars the string is returned unchanged.
 */
export function truncateLargeContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  const headChars = Math.max(0, maxChars - TAIL_CHARS);
  const head = content.slice(0, headChars);
  const tail = content.slice(content.length - TAIL_CHARS);
  const droppedChars = content.length - headChars - TAIL_CHARS;

  return head + MARKER_TEMPLATE(droppedChars) + tail;
}
