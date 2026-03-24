// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

export interface TruncationPolicy {
  /** Maximum characters to keep for this tool's output */
  maxChars: number;
  /** How to truncate: head-tail preserves start+end, head-only keeps only the beginning */
  strategy: 'head-tail' | 'head-only';
  /** Human-readable description of why this policy exists */
  reason: string;
}

/**
 * Tool-specific truncation policies based on the value density and re-retrievability
 * of different tool outputs. Tools that produce easily re-obtainable results (like
 * file reads or directory listings) get more aggressive truncation than tools that
 * produce unique results (like compilation errors or test outputs).
 */
export const TOOL_POLICIES: Record<string, TruncationPolicy> = {
  // File operations — can be re-read if needed, moderate truncation
  'Read': {
    maxChars: 1500,
    strategy: 'head-tail',
    reason: 'File content can be re-read if needed',
  },
  'View': {
    maxChars: 1500,
    strategy: 'head-tail',
    reason: 'File content can be re-read if needed',
  },
  'ReadFile': {
    maxChars: 1500,
    strategy: 'head-tail',
    reason: 'File content can be re-read if needed',
  },

  // Search operations — first few results usually sufficient, aggressive truncation
  'Grep': {
    maxChars: 1000,
    strategy: 'head-only',
    reason: 'First few search results are usually most relevant',
  },
  'Search': {
    maxChars: 1000,
    strategy: 'head-only',
    reason: 'First few search results are usually most relevant',
  },
  'SemanticSearch': {
    maxChars: 1200,
    strategy: 'head-only',
    reason: 'Top search results contain the most relevant information',
  },
  'Glob': {
    maxChars: 800,
    strategy: 'head-only',
    reason: 'File pattern matches are usually obvious from the first few results',
  },

  // Directory operations — very low information density, very aggressive truncation
  'ListDir': {
    maxChars: 500,
    strategy: 'head-only',
    reason: 'Directory listings have low information density',
  },
  'LS': {
    maxChars: 500,
    strategy: 'head-only',
    reason: 'Directory listings have low information density',
  },

  // Shell commands — preserve exit codes and key output, moderate truncation
  'Bash': {
    maxChars: 2000,
    strategy: 'head-tail',
    reason: 'Command output may contain important error messages or results',
  },
  'Shell': {
    maxChars: 2000,
    strategy: 'head-tail',
    reason: 'Command output may contain important error messages or results',
  },
  'RunCommand': {
    maxChars: 2000,
    strategy: 'head-tail',
    reason: 'Command output may contain important error messages or results',
  },

  // Write operations — results usually short, preserve fully
  'Write': {
    maxChars: 3000,
    strategy: 'head-tail',
    reason: 'Write confirmations are usually brief and important',
  },
  'WriteFile': {
    maxChars: 3000,
    strategy: 'head-tail',
    reason: 'Write confirmations are usually brief and important',
  },
  'Edit': {
    maxChars: 3000,
    strategy: 'head-tail',
    reason: 'Edit results may contain important diff information',
  },
  'StrReplace': {
    maxChars: 2500,
    strategy: 'head-tail',
    reason: 'Replacement confirmations contain important change details',
  },

  // Build/test operations — errors are unique and critical, preserve more
  'RunTests': {
    maxChars: 4000,
    strategy: 'head-tail',
    reason: 'Test failures contain unique diagnostic information',
  },
  'Build': {
    maxChars: 3500,
    strategy: 'head-tail',
    reason: 'Build errors are unique and cannot be easily reproduced',
  },
  'Compile': {
    maxChars: 3500,
    strategy: 'head-tail',
    reason: 'Compilation errors are unique and cannot be easily reproduced',
  },

  // Git operations — history and status info can be valuable
  'Git': {
    maxChars: 2500,
    strategy: 'head-tail',
    reason: 'Git output often contains important state information',
  },

  // Package management — install logs can be verbose but errors are important
  'NPM': {
    maxChars: 1800,
    strategy: 'head-tail',
    reason: 'Package manager output may contain important dependency information',
  },
  'Pip': {
    maxChars: 1800,
    strategy: 'head-tail',
    reason: 'Package manager output may contain important dependency information',
  },
};

/** Default policy for unknown tools */
export const DEFAULT_POLICY: TruncationPolicy = {
  maxChars: 3000,
  strategy: 'head-tail',
  reason: 'Conservative default for unknown tool types',
};

/**
 * Get the truncation policy for a given tool name.
 * Falls back to DEFAULT_POLICY for unknown tools.
 */
export function getPolicyForTool(toolName: string): TruncationPolicy {
  return TOOL_POLICIES[toolName] || DEFAULT_POLICY;
}

/**
 * Extract the tool name from a tool_use block.
 * Handles various possible field names and formats.
 */
export function extractToolName(toolUseBlock: any): string | null {
  if (!toolUseBlock || typeof toolUseBlock !== 'object') return null;
  
  // Try common field names
  return toolUseBlock.name || 
         toolUseBlock.function?.name || 
         toolUseBlock.tool_name || 
         null;
}

/**
 * Find the tool_use block that corresponds to a given tool_result.
 * Searches backwards through messages to find the matching assistant message.
 */
export function findCorrespondingToolUse(
  messages: any[], 
  currentIndex: number, 
  toolResultId: string
): string | null {
  // Search backwards from current message to find the assistant message with matching tool_use
  for (let i = currentIndex - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    
    for (const block of msg.content) {
      if (block.type === 'tool_use' && block.id === toolResultId) {
        return extractToolName(block);
      }
    }
  }
  
  return null;
}