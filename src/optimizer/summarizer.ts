// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Message = Record<string, any>;

interface ExtractedAction {
  type: 'tool' | 'user' | 'assistant';
  content: string;
  importance: 'high' | 'medium' | 'low';
}

/**
 * Generate a structured summary of dropped messages instead of a generic
 * "N messages omitted" placeholder. Extracts key actions, decisions, and
 * user instructions to maintain context continuity.
 */
export function summarizeDroppedMessages(messages: Message[]): string {
  if (messages.length === 0) {
    return '[Pruner: no messages to summarize]';
  }

  const actions = extractActionsFromMessages(messages);
  
  if (actions.length === 0) {
    return `[Pruner: ${messages.length} message${messages.length === 1 ? '' : 's'} omitted to reduce context size]`;
  }

  // Group actions by importance and format
  const highPriority = actions.filter(a => a.importance === 'high');
  const mediumPriority = actions.filter(a => a.importance === 'medium');
  const lowPriority = actions.filter(a => a.importance === 'low');

  const lines: string[] = [];
  
  // Always show high priority actions
  if (highPriority.length > 0) {
    lines.push(...highPriority.map(a => a.content));
  }

  // Show medium priority if we have space (max 10 total lines)
  if (lines.length < 8 && mediumPriority.length > 0) {
    const remaining = Math.min(mediumPriority.length, 8 - lines.length);
    lines.push(...mediumPriority.slice(0, remaining).map(a => a.content));
  }

  // Show low priority only if we have lots of space
  if (lines.length < 5 && lowPriority.length > 0) {
    const remaining = Math.min(lowPriority.length, 5 - lines.length);
    lines.push(...lowPriority.slice(0, remaining).map(a => a.content));
  }

  const summary = lines.join('\n');
  const messageCount = messages.length;
  
  return `[Pruner context summary (${messageCount} message${messageCount === 1 ? '' : 's'} compressed):\n${summary}]`;
}

/**
 * Extract meaningful actions from a sequence of messages.
 * Prioritizes user instructions, tool operations, and assistant decisions.
 */
function extractActionsFromMessages(messages: Message[]): ExtractedAction[] {
  const actions: ExtractedAction[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'user') {
      const userAction = extractUserAction(msg);
      if (userAction) actions.push(userAction);
    } else if (msg.role === 'assistant') {
      const assistantActions = extractAssistantActions(msg);
      actions.push(...assistantActions);
    }
  }

  return actions;
}

/**
 * Extract key information from user messages.
 * User instructions are generally high importance.
 */
function extractUserAction(msg: Message): ExtractedAction | null {
  if (typeof msg.content === 'string') {
    const text = msg.content.trim();
    if (text.length === 0) return null;

    // Extract first meaningful sentence
    const firstSentence = extractFirstSentence(text);
    if (firstSentence.length < 10) return null;

    // User instructions are high priority
    return {
      type: 'user',
      content: `User: "${firstSentence}"`,
      importance: 'high',
    };
  }

  // Handle structured user content (less common but possible)
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === 'text' && block.text) {
        const firstSentence = extractFirstSentence(block.text);
        if (firstSentence.length >= 10) {
          return {
            type: 'user',
            content: `User: "${firstSentence}"`,
            importance: 'high',
          };
        }
      }
    }
  }

  return null;
}

/**
 * Extract tool calls and key statements from assistant messages.
 */
function extractAssistantActions(msg: Message): ExtractedAction[] {
  const actions: ExtractedAction[] = [];

  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === 'tool_use') {
        const toolAction = extractToolAction(block);
        if (toolAction) actions.push(toolAction);
      } else if (block.type === 'text' && block.text) {
        const textAction = extractAssistantTextAction(block.text);
        if (textAction) actions.push(textAction);
      }
    }
  } else if (typeof msg.content === 'string') {
    const textAction = extractAssistantTextAction(msg.content);
    if (textAction) actions.push(textAction);
  }

  return actions;
}

/**
 * Convert a tool_use block into a human-readable action summary.
 */
function extractToolAction(block: any): ExtractedAction | null {
  const name = block.name || 'unknown';
  const input = block.input || {};

  let actionText: string;
  let importance: 'high' | 'medium' | 'low' = 'medium';

  switch (name) {
    case 'Read':
    case 'View':
    case 'ReadFile':
      actionText = `→ read ${getPathFromInput(input)}`;
      importance = 'low'; // Can be re-read
      break;

    case 'Write':
    case 'WriteFile':
    case 'Edit':
    case 'StrReplace':
      actionText = `→ wrote ${getPathFromInput(input)}`;
      importance = 'high'; // Changes are important
      break;

    case 'Bash':
    case 'Shell':
    case 'RunCommand':
      const cmd = input.command || input.cmd || '?';
      const shortCmd = cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd;
      actionText = `→ ran: ${shortCmd}`;
      importance = 'medium';
      break;

    case 'Grep':
    case 'Search':
    case 'SemanticSearch':
      const query = input.query || input.pattern || input.search_term || '?';
      const shortQuery = query.length > 40 ? query.slice(0, 40) + '...' : query;
      actionText = `→ searched "${shortQuery}"`;
      importance = 'low'; // Can be re-searched
      break;

    case 'Glob':
    case 'ListDir':
    case 'LS':
      actionText = `→ listed ${getPathFromInput(input) || 'directory'}`;
      importance = 'low';
      break;

    case 'RunTests':
    case 'Build':
    case 'Compile':
      actionText = `→ ${name.toLowerCase()}`;
      importance = 'high'; // Test/build results are unique
      break;

    case 'Git':
      const gitCmd = input.command || input.args?.[0] || '?';
      actionText = `→ git ${gitCmd}`;
      importance = 'medium';
      break;

    default:
      actionText = `→ ${name}(...)`;
      importance = 'medium';
  }

  return {
    type: 'tool',
    content: actionText,
    importance,
  };
}

/**
 * Extract key statements from assistant text responses.
 * Focus on decisions, conclusions, and status updates.
 */
function extractAssistantTextAction(text: string): ExtractedAction | null {
  const trimmed = text.trim();
  if (trimmed.length < 15) return null;

  // Extract first meaningful sentence
  const firstSentence = extractFirstSentence(trimmed);
  if (firstSentence.length < 15) return null;

  // Determine importance based on content patterns
  let importance: 'high' | 'medium' | 'low' = 'medium';

  const lowerText = firstSentence.toLowerCase();
  
  // High importance: decisions, errors, completions
  if (lowerText.includes('error') || 
      lowerText.includes('failed') || 
      lowerText.includes('complete') || 
      lowerText.includes('done') ||
      lowerText.includes('issue') ||
      lowerText.includes('problem') ||
      lowerText.includes('fixed') ||
      lowerText.includes('created') ||
      lowerText.includes('updated')) {
    importance = 'high';
  }
  // Low importance: observations, explanations
  else if (lowerText.includes('i see') || 
           lowerText.includes('looking at') || 
           lowerText.includes('this shows') ||
           lowerText.includes('appears to')) {
    importance = 'low';
  }

  return {
    type: 'assistant',
    content: `Claude: "${firstSentence}"`,
    importance,
  };
}

/**
 * Extract file path from various input formats.
 */
function getPathFromInput(input: any): string | null {
  if (!input || typeof input !== 'object') return null;
  
  return input.path || 
         input.file_path || 
         input.filepath || 
         input.filename || 
         input.file || 
         null;
}

/**
 * Extract the first complete sentence from text.
 * Handles various sentence endings and common abbreviations.
 */
function extractFirstSentence(text: string): string {
  // Split on sentence boundaries, but be careful with abbreviations
  const sentences = text.split(/[.!?]+\s+/);
  
  if (sentences.length === 0) return text.slice(0, 100);
  
  let firstSentence = sentences[0].trim();
  
  // If the first "sentence" is very short, it might be an abbreviation
  // Try to include the next part
  if (firstSentence.length < 20 && sentences.length > 1) {
    firstSentence = `${firstSentence}. ${sentences[1].trim()}`;
  }
  
  // Limit length to keep summaries concise
  if (firstSentence.length > 120) {
    firstSentence = firstSentence.slice(0, 117) + '...';
  }
  
  return firstSentence;
}