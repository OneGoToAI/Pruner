// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { truncateLargeContent } from './truncate.js';
import { getPolicyForTool, findCorrespondingToolUse } from './tool-policies.js';
import { summarizeDroppedMessages } from './summarizer.js';
import { generateSmartSummary } from './llm-summarizer.js';
import { deduplicateToolResults } from './dedup.js';
import { getConfig } from '../config.js';

const ASSISTANT_HISTORY_MAX_CHARS = 5000;
const PRUNER_TRUNCATED_MARKER = (n: number) => `[Pruner: truncated ${n} chars]`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnthropicBody = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Message = Record<string, any>;

/**
 * Check whether a user message contains tool_result blocks.
 * The Anthropic API requires every tool_result to have a matching tool_use
 * in the immediately preceding assistant message.
 */
function hasToolResultBlock(msg: Message): boolean {
  if (msg.role !== 'user' || !Array.isArray(msg.content)) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return msg.content.some((block: any) => block.type === 'tool_result');
}

/**
 * Strategy 1 — Message count cap
 *
 * When messages exceed maxMessages:
 *   - Always keep the first message (usually the system-level user instruction)
 *   - Drop the oldest messages from position [1 … end - (maxMessages - 1)]
 *   - Keep the most recent (maxMessages - 1) messages
 *   - Adjust the cut boundary so tool_use / tool_result pairs are never split
 */
function applyMessageCap(messages: Message[], maxMessages: number): Message[] {
  if (messages.length <= maxMessages) return messages;

  const kept = maxMessages - 1;
  let cutStart = messages.length - kept;

  // If the first kept message is a user message with tool_result, the matching
  // tool_use lives in the previous assistant message which would be dropped.
  // Expand the kept window backwards until the boundary is clean.
  while (cutStart > 1 && hasToolResultBlock(messages[cutStart])) {
    cutStart--;
  }

  const dropped = cutStart - 1;
  if (dropped <= 0) return messages;

  const { enableSmartSummaries, enableLlmSummary } = getConfig().optimizer;
  const droppedMessages = messages.slice(1, cutStart);
  
  let summaryContent: string;
  if (enableLlmSummary) {
    // Three-tier: cached LLM summary → rule-based → generic placeholder
    summaryContent = generateSmartSummary(droppedMessages);
  } else if (enableSmartSummaries) {
    summaryContent = summarizeDroppedMessages(droppedMessages);
  } else {
    summaryContent = `[Pruner: ${dropped} message${dropped === 1 ? '' : 's'} omitted to reduce context size. The conversation continues from here.]`;
  }
  
  const placeholder: Message = {
    role: 'user',
    content: summaryContent,
  };

  return [messages[0], placeholder, ...messages.slice(cutStart)];
}

/**
 * Strategy 2 — tool_result truncation
 *
 * For user messages whose content is an array, truncate any tool_result
 * block using tool-specific policies based on the corresponding tool_use.
 * Different tools have different value densities and re-retrievability.
 */
function truncateToolResults(messages: Message[], fallbackMaxChars: number): Message[] {
  return messages.map((msg, msgIndex) => {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg;

    const newContent = msg.content.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (block: any) => {
        if (block.type !== 'tool_result') return block;

        // Find the corresponding tool_use to determine truncation policy
        const toolName = findCorrespondingToolUse(messages, msgIndex, block.tool_use_id);
        const policy = toolName ? getPolicyForTool(toolName) : { maxChars: fallbackMaxChars, strategy: 'head-tail' as const };

        if (typeof block.content === 'string') {
          return truncateToolResultContent(block, policy);
        }

        // tool_result content can also be an array of text blocks
        if (Array.isArray(block.content)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newInner = block.content.map((inner: any) => {
            if (inner.type !== 'text' || !inner.text) return inner;
            if (inner.text.length <= policy.maxChars) return inner;
            
            const truncated = policy.strategy === 'head-only'
              ? inner.text.slice(0, policy.maxChars)
              : truncateLargeContent(inner.text, policy.maxChars);
            
            return { ...inner, text: truncated };
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
 * Apply tool-specific truncation policy to a tool_result block.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function truncateToolResultContent(block: any, policy: { maxChars: number; strategy: 'head-tail' | 'head-only' }): any {
  if (typeof block.content !== 'string' || block.content.length <= policy.maxChars) {
    return block;
  }

  let truncatedContent: string;
  
  if (policy.strategy === 'head-only') {
    const dropped = block.content.length - policy.maxChars;
    truncatedContent = block.content.slice(0, policy.maxChars) + PRUNER_TRUNCATED_MARKER(dropped);
  } else {
    // head-tail strategy
    truncatedContent = truncateLargeContent(block.content, policy.maxChars);
  }

  return {
    ...block,
    content: truncatedContent,
  };
}

/**
 * Calculate maximum allowed characters for an assistant message based on its age.
 * Newer messages get more generous limits, older messages get more aggressive truncation.
 */
function getMaxCharsForAge(messageIndex: number, totalMessages: number): number {
  const age = totalMessages - 1 - messageIndex; // 0 = newest, higher = older
  
  if (age <= 2) return ASSISTANT_HISTORY_MAX_CHARS;     // Recent: 5000 chars
  if (age <= 5) return Math.floor(ASSISTANT_HISTORY_MAX_CHARS * 0.6);  // 3000 chars
  if (age <= 10) return Math.floor(ASSISTANT_HISTORY_MAX_CHARS * 0.3); // 1500 chars
  return Math.floor(ASSISTANT_HISTORY_MAX_CHARS * 0.16);               // 800 chars
}

/**
 * Strategy 3 — Trim long assistant messages in history with distance decay
 *
 * For every assistant message except the last, truncate string content
 * using age-based limits. Older messages get more aggressive truncation
 * since they're less likely to be relevant to current context.
 */
function trimHistoryAssistantMessages(messages: Message[]): Message[] {
  return messages.map((msg, idx) => {
    const isLast = idx === messages.length - 1;
    if (isLast || msg.role !== 'assistant') return msg;

    const maxChars = getMaxCharsForAge(idx, messages.length);

    if (typeof msg.content === 'string' && msg.content.length > maxChars) {
      return {
        ...msg,
        content: truncateLargeContent(msg.content, maxChars),
      };
    }

    if (Array.isArray(msg.content)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newContent = msg.content.map((block: any) => {
        if (block.type === 'text' && block.text && block.text.length > maxChars) {
          return { ...block, text: truncateLargeContent(block.text, maxChars) };
        }
        
        // Also compress old tool_use blocks by summarizing large inputs
        if (block.type === 'tool_use' && idx < messages.length - 10) {
          return compressOldToolUse(block);
        }
        
        return block;
      });
      return { ...msg, content: newContent };
    }

    return msg;
  });
}

/**
 * Compress tool_use blocks in very old messages by summarizing large inputs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compressOldToolUse(block: any): any {
  if (!block.input || typeof block.input !== 'object') return block;
  
  const inputStr = JSON.stringify(block.input);
  if (inputStr.length <= 500) return block;
  
  // For very large inputs, replace with a summary
  const toolName = block.name || 'unknown';
  const summary = `{_pruner_summary: "${toolName} with ${inputStr.length} chars of input"}`;
  
  try {
    return { ...block, input: JSON.parse(summary) };
  } catch {
    return { ...block, input: { _pruner_summary: `${toolName}(large input)` } };
  }
}

/**
 * Apply all context-pruning strategies to the request body.
 */
export function pruneContext(body: AnthropicBody, maxMessages: number, maxToolOutputChars: number): AnthropicBody {
  if (!Array.isArray(body.messages)) return body;

  const { enableDedup } = getConfig().optimizer;

  let messages: Message[] = body.messages;

  // Dedup runs first: replace older duplicate file reads and command outputs
  // with short references before any truncation decisions are made.
  if (enableDedup) {
    messages = deduplicateToolResults(messages);
  }

  messages = applyMessageCap(messages, maxMessages);
  messages = truncateToolResults(messages, maxToolOutputChars);
  messages = trimHistoryAssistantMessages(messages);

  return { ...body, messages };
}
