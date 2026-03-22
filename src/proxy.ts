import express from 'express';
import axios from 'axios';
import chalk from 'chalk';

export interface TokenStats {
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  savings: number;
}

export interface MessageRequest {
  messages: any[];
  model: string;
  max_tokens?: number;
  temperature?: number;
  [key: string]: any;
}

export interface MessageResponse {
  id: string;
  type: string;
  role: string;
  content: any[];
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Formats a number with thousand separators (commas)
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Calculates token compression statistics
 */
export function calculateTokenStats(originalTokens: number, compressedTokens: number): TokenStats {
  const compressionRatio = ((originalTokens - compressedTokens) / originalTokens) * 100;
  // Assuming $0.003 per 1000 input tokens (Claude-3.5 pricing)
  const inputCostPer1k = 0.003;
  const savings = ((originalTokens - compressedTokens) / 1000) * inputCostPer1k;

  return {
    originalTokens,
    compressedTokens,
    compressionRatio,
    savings
  };
}

/**
 * Prints colored token statistics to console
 */
export function printTokenStats(stats: TokenStats, isPassthrough: boolean = false): void {
  const { originalTokens, compressedTokens, compressionRatio, savings } = stats;

  if (isPassthrough) {
    // When compression engine is degraded (direct passthrough)
    console.log(chalk.gray(`[Pruner] → 透传: ${formatNumber(originalTokens)} tokens | 无压缩`));
    return;
  }

  const compressionText = compressionRatio > 0 ?
    chalk.green(`-${compressionRatio.toFixed(1)}%`) :
    chalk.gray('0.0%');

  const savingsText = savings > 0.001 ?
    chalk.green(`$${savings.toFixed(3)}`) :
    chalk.gray('$0.000');

  console.log(
    `${chalk.blue('[Pruner]')} ${chalk.cyan('↓')} 压缩: ${formatNumber(originalTokens)} → ${formatNumber(compressedTokens)} tokens (${compressionText}) | 节省: ${savingsText}`
  );
}

/**
 * Mock function to simulate token compression
 * In a real implementation, this would integrate with the actual compression engine
 */
export function compressMessages(messages: any[]): { compressed: any[], originalTokens: number, compressedTokens: number } {
  // Validate input
  if (!Array.isArray(messages)) {
    throw new Error('Messages must be an array');
  }

  // Mock implementation - replace with actual compression logic
  const messageText = JSON.stringify(messages);
  const originalTokens = Math.floor(messageText.length / 4); // Rough token estimation

  // Simulate compression (in reality this would be much more sophisticated)
  const compressionFactor = 0.25; // 75% reduction
  const compressedTokens = Math.floor(originalTokens * compressionFactor);

  return {
    compressed: messages, // In reality, this would be compressed
    originalTokens,
    compressedTokens
  };
}

/**
 * Creates an Express router for handling Claude API proxy requests
 */
export function createProxyRouter(): express.Router {
  const router = express.Router();

  // POST /v1/messages endpoint handler
  router.post('/v1/messages', async (req: express.Request, res: express.Response) => {
    try {
      const messageRequest: MessageRequest = req.body;

      // Validate required fields
      if (!messageRequest || !Array.isArray(messageRequest.messages)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Request must include a messages array'
        });
      }

      // Get original token count
      const originalMessages = messageRequest.messages;
      let compressedMessages = originalMessages;
      let tokenStats: TokenStats;
      let isPassthrough = false;

      try {
        // Attempt compression
        const compressionResult = compressMessages(originalMessages);
        compressedMessages = compressionResult.compressed;
        tokenStats = calculateTokenStats(
          compressionResult.originalTokens,
          compressionResult.compressedTokens
        );
      } catch (error) {
        // Compression engine degraded - use passthrough
        console.warn('Compression engine failed, using passthrough:', error);
        isPassthrough = true;
        const estimatedTokens = Math.floor(JSON.stringify(originalMessages).length / 4);
        tokenStats = calculateTokenStats(estimatedTokens, estimatedTokens);
      }

      // Forward request to Claude API
      const claudeRequest = {
        ...messageRequest,
        messages: compressedMessages
      };

      // Mock Claude API response (replace with actual API call)
      const claudeResponse: MessageResponse = {
        id: 'msg_' + Date.now(),
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Mock response from Claude API' }],
        model: messageRequest.model || 'claude-3.5-sonnet-20241022',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: tokenStats.compressedTokens,
          output_tokens: 150
        }
      };

      // Print token statistics after processing
      printTokenStats(tokenStats, isPassthrough);

      // Return response to client
      res.json(claudeResponse);

    } catch (error) {
      console.error('Error processing /v1/messages request:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to process request'
      });
    }
  });

  return router;
}

/**
 * Creates and configures the Express application
 */
export function createApp(): express.Application {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Error handling middleware for malformed JSON
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid JSON in request body'
      });
    }
    next(err);
  });

  // Add proxy router
  app.use('/', createProxyRouter());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}