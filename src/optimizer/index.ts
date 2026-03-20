import { Config } from '../config';
import { Cache } from './cache';
import { Pruner } from './pruner';
import { Truncator } from './truncate';

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class Optimizer {
  private cache: Cache;
  private pruner: Pruner;
  private truncator: Truncator;

  constructor(private config: Config) {
    this.cache = new Cache(config);
    this.pruner = new Pruner(config);
    this.truncator = new Truncator(config);
  }

  async process(request: ChatRequest): Promise<ChatResponse> {
    // Check cache first if enabled
    if (this.config.optimizer.cacheEnabled) {
      const cachedResponse = await this.cache.get(request);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    // Apply pruning and truncation strategies
    const optimizedRequest = await this.pruner.optimize(request);
    const finalRequest = await this.truncator.truncate(optimizedRequest);

    // Forward to upstream API (mock for now)
    const response = await this.forwardRequest(finalRequest);

    // Cache the response if enabled
    if (this.config.optimizer.cacheEnabled) {
      await this.cache.set(request, response);
    }

    return response;
  }

  private async forwardRequest(request: ChatRequest): Promise<ChatResponse> {
    // Mock implementation - in real version, this would forward to the upstream API
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'This is a mock response from Pruner proxy.'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20
      }
    };
  }
}