import { Config } from '../config';
import { ChatRequest, ChatMessage } from './index';
import { get_encoding } from 'tiktoken';

export class Truncator {
  private encoding: any;

  constructor(private config: Config) {
    // Initialize tiktoken encoding for token counting
    this.encoding = get_encoding('cl100k_base');
  }

  async truncate(request: ChatRequest): Promise<ChatRequest> {
    const totalTokens = this.countTokens(request.messages);
    const maxTokens = this.config.optimizer.maxTokens;

    if (totalTokens <= maxTokens) {
      return request;
    }

    // Truncate messages to fit within token limit
    const truncatedMessages = await this.truncateMessages(request.messages, maxTokens);

    return {
      ...request,
      messages: truncatedMessages
    };
  }

  private countTokens(messages: ChatMessage[]): number {
    let totalTokens = 0;

    for (const message of messages) {
      // Count tokens for role and content
      totalTokens += this.encoding.encode(message.role).length;
      totalTokens += this.encoding.encode(message.content).length;
      totalTokens += 3; // Overhead per message
    }

    return totalTokens;
  }

  private async truncateMessages(messages: ChatMessage[], maxTokens: number): Promise<ChatMessage[]> {
    const result: ChatMessage[] = [];
    let currentTokens = 0;

    // Always include system messages first
    const systemMessages = messages.filter(msg => msg.role === 'system');
    for (const message of systemMessages) {
      const messageTokens = this.countTokens([message]);
      if (currentTokens + messageTokens <= maxTokens) {
        result.push(message);
        currentTokens += messageTokens;
      }
    }

    // Add other messages in reverse order (most recent first)
    const nonSystemMessages = messages
      .filter(msg => msg.role !== 'system')
      .reverse();

    for (const message of nonSystemMessages) {
      const messageTokens = this.countTokens([message]);
      if (currentTokens + messageTokens <= maxTokens) {
        result.unshift(message); // Add to beginning to maintain order
        currentTokens += messageTokens;
      } else {
        // Try to truncate the message content if it's too long
        const truncatedMessage = this.truncateMessageContent(message, maxTokens - currentTokens);
        if (truncatedMessage) {
          result.unshift(truncatedMessage);
          break;
        }
      }
    }

    return result;
  }

  private truncateMessageContent(message: ChatMessage, availableTokens: number): ChatMessage | null {
    if (availableTokens < 10) {
      return null;
    }

    const contentTokens = this.encoding.encode(message.content);
    const maxContentTokens = availableTokens - 10; // Reserve tokens for role and overhead

    if (contentTokens.length <= maxContentTokens) {
      return message;
    }

    // Truncate content to fit
    const truncatedTokens = contentTokens.slice(0, maxContentTokens);
    const truncatedContent = this.encoding.decode(truncatedTokens);

    return {
      ...message,
      content: truncatedContent + '...'
    };
  }
}