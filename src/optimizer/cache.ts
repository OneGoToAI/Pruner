import { Config } from '../config';
import { ChatRequest, ChatResponse } from './index';
import crypto from 'crypto';

export class Cache {
  private memoryCache: Map<string, ChatResponse> = new Map();

  constructor(private config: Config) {
    // Initialize cache
  }

  async get(request: ChatRequest): Promise<ChatResponse | null> {
    const key = this.generateKey(request);
    return this.memoryCache.get(key) || null;
  }

  async set(request: ChatRequest, response: ChatResponse): Promise<void> {
    const key = this.generateKey(request);
    this.memoryCache.set(key, response);

    // Simple LRU-like behavior: remove oldest entries if cache grows too large
    if (this.memoryCache.size > 1000) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
  }

  async size(): Promise<number> {
    return this.memoryCache.size;
  }

  private generateKey(request: ChatRequest): string {
    // Create a deterministic key from the request
    const normalizedRequest = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature || 0.7,
      max_tokens: request.max_tokens
    };

    const requestString = JSON.stringify(normalizedRequest);
    return crypto.createHash('sha256').update(requestString).digest('hex');
  }
}