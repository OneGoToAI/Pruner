import { Config } from '../config';
import { ChatRequest, ChatMessage } from './index';

export class Pruner {
  constructor(private config: Config) {}

  async optimize(request: ChatRequest): Promise<ChatRequest> {
    if (!this.shouldPrune(request)) {
      return request;
    }

    // Apply pruning strategies
    const prunedMessages = await this.pruneMessages(request.messages);

    return {
      ...request,
      messages: prunedMessages
    };
  }

  private shouldPrune(request: ChatRequest): boolean {
    // Simple heuristic: prune if there are more than 10 messages
    return request.messages.length > 10;
  }

  private async pruneMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
    if (messages.length <= 10) {
      return messages;
    }

    // Keep the system message (if any) and the last few messages
    const systemMessages = messages.filter(msg => msg.role === 'system');
    const nonSystemMessages = messages.filter(msg => msg.role !== 'system');

    // Keep the last 8 non-system messages
    const recentMessages = nonSystemMessages.slice(-8);

    // Combine system messages with recent messages
    return [...systemMessages, ...recentMessages];
  }

  private async calculateImportanceScore(message: ChatMessage): Promise<number> {
    // Simple scoring based on content length and recency
    const lengthScore = message.content.length / 1000; // Normalize by length
    const roleScore = message.role === 'system' ? 2 : message.role === 'user' ? 1.5 : 1;

    return lengthScore * roleScore;
  }
}