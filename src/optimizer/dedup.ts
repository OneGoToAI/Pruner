// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Message = Record<string, any>;

const READ_TOOLS = new Set(['Read', 'View', 'ReadFile', 'read', 'view']);
const SHELL_TOOLS = new Set(['Bash', 'Shell', 'RunCommand', 'bash', 'shell']);
const DEDUP_COMMANDS = new Set(['git status', 'git diff', 'git log', 'ls', 'pwd', 'cat', 'head', 'tail']);

interface ToolUseInfo {
  toolUseId: string;
  toolName: string;
  /** File path for Read/View tools, command string for Shell tools */
  key: string;
  messageIndex: number;
  blockIndex: number;
}

/**
 * Deduplicate repeated tool results in the conversation.
 *
 * Strategy:
 *   1. Scan all assistant messages for tool_use blocks (Read, View, Bash, Shell)
 *   2. Track which files have been read / which commands have been run
 *   3. For duplicates, keep the LATEST full result, replace older ones with a short reference
 *
 * This is safe because:
 *   - The latest read always has the most up-to-date content
 *   - If the file changed between reads, the latest version is what matters
 *   - Older reads were only relevant at the time they happened
 */
export function deduplicateToolResults(messages: Message[]): Message[] {
  const toolUseMap = buildToolUseMap(messages);
  const readOccurrences = groupByKey(toolUseMap.filter(t => READ_TOOLS.has(t.toolName)));
  const shellOccurrences = groupByKey(toolUseMap.filter(t => SHELL_TOOLS.has(t.toolName)));

  const idsToDedup = new Set<string>();

  collectDedupTargets(readOccurrences, idsToDedup);
  collectDedupTargets(shellOccurrences, idsToDedup);

  if (idsToDedup.size === 0) return messages;

  return replaceOldResults(messages, idsToDedup, toolUseMap);
}

/**
 * Scan all messages and build a map of tool_use invocations with their metadata.
 */
function buildToolUseMap(messages: Message[]): ToolUseInfo[] {
  const result: ToolUseInfo[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;

    for (let b = 0; b < msg.content.length; b++) {
      const block = msg.content[b];
      if (block.type !== 'tool_use') continue;

      const toolName = block.name || '';
      const input = block.input || {};

      if (READ_TOOLS.has(toolName)) {
        const path = input.path || input.file_path || input.filepath || input.file || '';
        if (path) {
          result.push({ toolUseId: block.id, toolName, key: path, messageIndex: i, blockIndex: b });
        }
      } else if (SHELL_TOOLS.has(toolName)) {
        const command = normalizeCommand(input.command || input.cmd || '');
        if (command && isDedupableCommand(command)) {
          result.push({ toolUseId: block.id, toolName, key: command, messageIndex: i, blockIndex: b });
        }
      }
    }
  }

  return result;
}

/**
 * Group tool uses by their key (file path or command).
 */
function groupByKey(infos: ToolUseInfo[]): Map<string, ToolUseInfo[]> {
  const groups = new Map<string, ToolUseInfo[]>();
  for (const info of infos) {
    const existing = groups.get(info.key) || [];
    existing.push(info);
    groups.set(info.key, existing);
  }
  return groups;
}

/**
 * For each group of duplicate tool uses, mark all but the latest for dedup.
 */
function collectDedupTargets(groups: Map<string, ToolUseInfo[]>, targets: Set<string>): void {
  for (const [, infos] of groups) {
    if (infos.length <= 1) continue;

    // Sort by message index (ascending), keep the last one (highest index = most recent)
    const sorted = [...infos].sort((a, b) => a.messageIndex - b.messageIndex);
    // Mark all except the last for dedup
    for (let i = 0; i < sorted.length - 1; i++) {
      targets.add(sorted[i].toolUseId);
    }
  }
}

/**
 * Replace old duplicate tool_result content with short references.
 */
function replaceOldResults(
  messages: Message[],
  idsToDedup: Set<string>,
  toolUseMap: ToolUseInfo[],
): Message[] {
  const idToInfo = new Map(toolUseMap.map(t => [t.toolUseId, t]));

  return messages.map((msg) => {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg;

    let changed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newContent = msg.content.map((block: any) => {
      if (block.type !== 'tool_result') return block;
      if (!idsToDedup.has(block.tool_use_id)) return block;

      const info = idToInfo.get(block.tool_use_id);
      if (!info) return block;

      changed = true;
      const label = READ_TOOLS.has(info.toolName)
        ? `[Pruner: ${info.key} — content deduplicated, latest version preserved below]`
        : `[Pruner: "${info.key}" — output deduplicated, latest result preserved below]`;

      if (typeof block.content === 'string') {
        return { ...block, content: label };
      }
      if (Array.isArray(block.content)) {
        return { ...block, content: [{ type: 'text', text: label }] };
      }
      return { ...block, content: label };
    });

    return changed ? { ...msg, content: newContent } : msg;
  });
}

/**
 * Normalize a shell command for comparison:
 * strip leading/trailing whitespace, collapse internal whitespace.
 */
function normalizeCommand(cmd: string): string {
  return cmd.trim().replace(/\s+/g, ' ');
}

/**
 * Check if a command is suitable for dedup. Only dedup idempotent/read-only
 * commands where re-running produces similar output.
 */
function isDedupableCommand(command: string): boolean {
  const lower = command.toLowerCase();
  for (const prefix of DEDUP_COMMANDS) {
    if (lower === prefix || lower.startsWith(prefix + ' ')) return true;
  }
  return false;
}
