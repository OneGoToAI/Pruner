// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { truncateLargeContent } from './truncate.js';
import { getPolicyForTool, findCorrespondingToolUse } from './tool-policies.js';
import { summarizeDroppedMessages } from './summarizer.js';
import { generateSmartSummary } from './llm-summarizer.js';
import { deduplicateToolResults } from './dedup.js';
import { getConfig } from '../config.js';

const ASSISTANT_HISTORY_MAX_CHARS = 5000;

const RE_READABLE_TOOLS = new Set(['Read', 'View', 'ReadFile', 'Grep', 'Search', 'SemanticSearch', 'Glob', 'ListDir', 'LS']);
const WRITE_TOOLS = new Set(['Write', 'WriteFile', 'Edit', 'StrReplace']);

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
 * Find the index of the last assistant message that contains tool_use blocks.
 * Everything from that assistant message onwards is considered the "latest round"
 * and should not have its tool_results truncated — Claude needs them in full
 * for current reasoning.
 */
function findLatestToolRoundStart(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasToolUse = msg.content.some((b: any) => b.type === 'tool_use');
    if (hasToolUse) return i;
  }
  return messages.length;
}

/**
 * Strategy 2 — tool_result truncation
 *
 * For user messages whose content is an array, truncate any tool_result
 * block using tool-specific policies based on the corresponding tool_use.
 * Different tools have different value densities and re-retrievability.
 *
 * IMPORTANT: The latest round of tool_results (from the most recent
 * assistant tool_use onwards) is NEVER truncated. Claude just requested
 * those results and needs them in full for current reasoning.
 */
function truncateToolResults(messages: Message[], fallbackMaxChars: number): Message[] {
  const latestRoundStart = findLatestToolRoundStart(messages);

  return messages.map((msg, msgIndex) => {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg;

    // Skip truncation for the latest round
    if (msgIndex >= latestRoundStart) return msg;

    const newContent = msg.content.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (block: any) => {
        if (block.type !== 'tool_result') return block;

        const toolName = findCorrespondingToolUse(messages, msgIndex, block.tool_use_id);
        const policy = toolName ? getPolicyForTool(toolName) : { maxChars: fallbackMaxChars, strategy: 'head-tail' as const };

        if (typeof block.content === 'string') {
          return truncateToolResultContent(block, policy, toolName);
        }

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
 * Includes a re-read hint so Claude can re-fetch if it needs the full content.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function truncateToolResultContent(block: any, policy: { maxChars: number; strategy: 'head-tail' | 'head-only' }, toolName?: string | null): any {
  if (typeof block.content !== 'string' || block.content.length <= policy.maxChars) {
    return block;
  }

  const dropped = block.content.length - policy.maxChars;
  const rereadHint = (toolName && RE_READABLE_TOOLS.has(toolName))
    ? ' Use the tool to re-read if needed.'
    : '';

  let truncatedContent: string;
  
  if (policy.strategy === 'head-only') {
    truncatedContent = block.content.slice(0, policy.maxChars) +
      `\n[Pruner: ${dropped} chars truncated.${rereadHint}]`;
  } else {
    const headChars = Math.max(0, policy.maxChars - 500);
    const head = block.content.slice(0, headChars);
    const tail = block.content.slice(block.content.length - 500);
    truncatedContent = head +
      `\n[Pruner: ${dropped} chars truncated from middle.${rereadHint}]\n` +
      tail;
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
        
        // Compress old tool_use blocks (especially Write/StrReplace with large content).
        // Skip the last 2 messages to protect the current round.
        if (block.type === 'tool_use' && idx < messages.length - 2) {
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
 * Compress tool_use blocks in old messages by summarizing large inputs.
 * Write/StrReplace inputs contain full file content that's no longer needed
 * once the write is confirmed — the file can be re-read if needed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compressOldToolUse(block: any): any {
  if (!block.input || typeof block.input !== 'object') return block;
  
  const toolName = block.name || 'unknown';
  const input = block.input;
  
  // Write/StrReplace: the file was already written, content is no longer needed
  if (WRITE_TOOLS.has(toolName)) {
    const path = input.path || input.file_path || '';
    const contentLen = typeof input.content === 'string' ? input.content.length : 0;
    const oldStr = typeof input.old_string === 'string' ? input.old_string : undefined;
    const newStr = typeof input.new_string === 'string' ? input.new_string : undefined;
    
    if (toolName === 'StrReplace' && oldStr && newStr) {
      return {
        ...block,
        input: {
          path,
          _pruner_compressed: `replaced ${oldStr.length} chars with ${newStr.length} chars`,
        },
      };
    }
    
    if (contentLen > 500) {
      return {
        ...block,
        input: {
          path,
          _pruner_compressed: `wrote ${contentLen} chars (use Read to verify)`,
        },
      };
    }
  }
  
  // Generic compression for other tools with very large inputs
  const inputStr = JSON.stringify(input);
  if (inputStr.length <= 800) return block;
  
  return {
    ...block,
    input: { _pruner_compressed: `${toolName} with ${inputStr.length} chars of input` },
  };
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
