// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Proprietary and confidential. Unauthorized use prohibited.

import { truncateLargeContent } from './truncate.js';

const ASSISTANT_HISTORY_MAX_CHARS = 5000;
const PRUNER_TRUNCATED_MARKER = (n: number) => `[Pruner: truncated ${n} chars]`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnthropicBody = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Message = Record<string, any>;

/**
 * Strategy 1 — Message count cap
 *
 * When messages exceed maxMessages:
 *   - Always keep the first message (usually the system-level user instruction)
 *   - Drop the oldest messages from position [1 … end - (maxMessages - 1)]
 *   - Keep the most recent (maxMessages - 1) messages
 */
function applyMessageCap(messages: Message[], maxMessages: number): Message[] {
  if (messages.length <= maxMessages) return messages;

  const kept = maxMessages - 1; // slots for recent messages (first slot is always messages[0])
  const dropped = messages.length - 1 - kept; // how many middle messages are dropped

  // Insert a placeholder so the model understands the context gap
  const placeholder: Message = {
    role: 'user',
    content: `[Pruner: ${dropped} message${dropped === 1 ? '' : 's'} omitted to reduce context size. The conversation continues from here.]`,
  };

  return [messages[0], placeholder, ...messages.slice(messages.length - kept)];
}

/**
 * Strategy 2 — tool_result truncation
 *
 * For user messages whose content is an array, truncate any tool_result
 * block that exceeds maxToolOutputChars.
 */
function truncateToolResults(messages: Message[], maxToolOutputChars: number): Message[] {
  return messages.map((msg) => {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg;

    const newContent = msg.content.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (block: any) => {
        if (block.type !== 'tool_result') return block;

        if (typeof block.content === 'string' && block.content.length > maxToolOutputChars) {
          const dropped = block.content.length - maxToolOutputChars;
          return {
            ...block,
            content: block.content.slice(0, maxToolOutputChars) + PRUNER_TRUNCATED_MARKER(dropped),
          };
        }

        // tool_result content can also be an array of text blocks
        if (Array.isArray(block.content)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newInner = block.content.map((inner: any) => {
            if (inner.type !== 'text' || !inner.text) return inner;
            if (inner.text.length <= maxToolOutputChars) return inner;
            const dropped = inner.text.length - maxToolOutputChars;
            return {
              ...inner,
              text: inner.text.slice(0, maxToolOutputChars) + PRUNER_TRUNCATED_MARKER(dropped),
            };
          });
          return { ...block, content: newInner };
        }

        return block;
      },
    );

    return { ...msg, content: newContent };
  });
}

/**
 * Strategy 3 — Trim long assistant messages in history
 *
 * For every assistant message except the last, truncate string content
 * that exceeds ASSISTANT_HISTORY_MAX_CHARS. This prevents large code
 * generation outputs from being re-sent verbatim in subsequent turns.
 */
function trimHistoryAssistantMessages(messages: Message[]): Message[] {
  return messages.map((msg, idx) => {
    const isLast = idx === messages.length - 1;
    if (isLast || msg.role !== 'assistant') return msg;

    if (typeof msg.content === 'string' && msg.content.length > ASSISTANT_HISTORY_MAX_CHARS) {
      return {
        ...msg,
        content: truncateLargeContent(msg.content, ASSISTANT_HISTORY_MAX_CHARS),
      };
    }

    if (Array.isArray(msg.content)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newContent = msg.content.map((block: any) => {
        if (block.type !== 'text' || !block.text) return block;
        if (block.text.length <= ASSISTANT_HISTORY_MAX_CHARS) return block;
        return { ...block, text: truncateLargeContent(block.text, ASSISTANT_HISTORY_MAX_CHARS) };
      });
      return { ...msg, content: newContent };
    }

    return msg;
  });
}

/**
 * Apply all context-pruning strategies to the request body.
 */
export function pruneContext(body: AnthropicBody, maxMessages: number, maxToolOutputChars: number): AnthropicBody {
  if (!Array.isArray(body.messages)) return body;

  let messages: Message[] = body.messages;
  messages = applyMessageCap(messages, maxMessages);
  messages = truncateToolResults(messages, maxToolOutputChars);
  messages = trimHistoryAssistantMessages(messages);

  return { ...body, messages };
}
