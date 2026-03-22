import { get_encoding } from 'tiktoken';

/**
 * System message content - can be a string or array of content blocks
 */
type SystemContent = string | Array<{
  type: string;
  text?: string;
  [key: string]: any;
}>;

/**
 * Message content - can be a string or array of content blocks
 */
type MessageContent = string | Array<{
  type: string;
  text?: string;
  [key: string]: any;
}>;

/**
 * Anthropic API request structure for token counting
 */
export interface AnthropicRequest {
  system?: SystemContent;
  messages?: Array<{
    role: string;
    content: MessageContent;
    [key: string]: any;
  }>;
  [key: string]: any;
}

/**
 * Global encoder instance for reuse
 */
let encoder: any = null;
let encoderError: Error | null = null;

/**
 * Initialize tiktoken encoder with error handling
 */
function getEncoder(): any {
  if (encoder) return encoder;
  if (encoderError) return null;

  try {
    encoder = get_encoding('cl100k_base');
    return encoder;
  } catch (error) {
    encoderError = error instanceof Error ? error : new Error('Unknown tiktoken error');
    console.warn('tiktoken initialization failed, falling back to estimation:', encoderError.message);
    return null;
  }
}

/**
 * Extract text content from content that can be string or array
 */
function extractTextContent(content: SystemContent | MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(block => block && block.type === 'text' && block.text)
      .map(block => block.text)
      .join(' ');
  }

  return '';
}

/**
 * Count tokens in a text string using tiktoken or fallback estimation
 * @param text The text to count tokens for
 * @returns Number of tokens
 */
export function countTokensText(text: string): number {
  if (!text) return 0;

  const tiktoken = getEncoder();

  if (tiktoken) {
    try {
      const tokens = tiktoken.encode(text);
      return tokens.length;
    } catch (error) {
      console.warn('tiktoken encoding failed, falling back to estimation:', error);
    }
  }

  // Fallback: estimate using character count divided by 4
  return Math.ceil(text.length / 4);
}

/**
 * Count total tokens in an Anthropic API request body
 * @param body The Anthropic request body
 * @returns Total number of tokens
 */
export function countTokens(body: AnthropicRequest): number {
  let totalTokens = 0;

  // Count system message tokens
  if (body.system) {
    const systemText = extractTextContent(body.system);
    totalTokens += countTokensText(systemText);
  }

  // Count message tokens
  if (body.messages && Array.isArray(body.messages)) {
    for (const message of body.messages) {
      if (message && message.content) {
        const messageText = extractTextContent(message.content);
        totalTokens += countTokensText(messageText);
      }
    }
  }

  return totalTokens;
}