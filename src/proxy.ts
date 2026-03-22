#!/usr/bin/env node

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { request as undiciRequest, Response } from 'undici';

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const DEFAULT_PORT = 8080;
const REQUEST_TIMEOUT = 120 * 1000; // 120 seconds in milliseconds

interface ProxyServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

class AnthropicProxy implements ProxyServer {
  private fastify: FastifyInstance;
  private port: number;

  constructor(port: number = DEFAULT_PORT) {
    this.port = port;
    this.fastify = Fastify({
      logger: true,
      trustProxy: false, // Only trust localhost
    });

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Catch-all route to proxy everything to Anthropic
    this.fastify.all('*', this.proxyHandler.bind(this));
  }

  private async proxyHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const targetUrl = `${ANTHROPIC_API_BASE}${request.url}`;

    try {
      // Prepare headers, filtering out connection-specific headers
      const forwardHeaders: Record<string, string> = {};

      // Copy all headers from the original request
      for (const [key, value] of Object.entries(request.headers)) {
        // Skip connection-specific headers that undici handles automatically
        const lowerKey = key.toLowerCase();
        if (
          lowerKey !== 'host' &&
          lowerKey !== 'connection' &&
          lowerKey !== 'transfer-encoding' &&
          value !== undefined
        ) {
          forwardHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value);
        }
      }

      // Get the request body properly
      let body: any = undefined;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = request.body;
        // If body is an object, stringify it
        if (typeof body === 'object' && body !== null) {
          body = JSON.stringify(body);
        }
      }

      // Make the request to Anthropic API
      const response = await undiciRequest(targetUrl, {
        method: request.method as any,
        headers: forwardHeaders,
        body,
        maxRedirections: 0, // Don't follow redirects
        headersTimeout: REQUEST_TIMEOUT,
        bodyTimeout: REQUEST_TIMEOUT,
      });

      // Set response status
      reply.code(response.statusCode);

      // Forward response headers, excluding conflicting ones
      const responseHeaders = response.headers;
      for (const [key, value] of Object.entries(responseHeaders)) {
        const lowerKey = key.toLowerCase();
        // Skip headers that Fastify or HTTP client will handle automatically
        if (
          value !== undefined &&
          lowerKey !== 'content-length' &&
          lowerKey !== 'transfer-encoding' &&
          lowerKey !== 'connection'
        ) {
          reply.header(key, value);
        }
      }

      // Check if this is a streaming response
      const contentType = responseHeaders['content-type'] as string;
      const isStreaming = contentType?.includes('text/event-stream');

      if (isStreaming) {
        // For streaming responses, pipe directly without modification
        reply.send(response.body);
      } else {
        // For non-streaming responses, get the full body
        const body = await response.body.text();
        reply.send(body);
      }

    } catch (error: any) {
      this.fastify.log.error(error, 'Proxy request failed');

      // Check if it's a timeout error
      if (error.code === 'UND_ERR_HEADERS_TIMEOUT' ||
          error.code === 'UND_ERR_BODY_TIMEOUT' ||
          error.code === 'ETIMEDOUT') {
        reply.code(504).send({
          error: {
            type: 'gateway_timeout',
            message: 'Request to Anthropic API timed out'
          }
        });
      } else if (error.statusCode) {
        // Forward HTTP error responses from Anthropic
        reply.code(error.statusCode);
        if (error.body) {
          reply.send(error.body);
        } else {
          reply.send({
            error: {
              type: 'api_error',
              message: error.message || 'Unknown error occurred'
            }
          });
        }
      } else {
        // Network or other errors
        reply.code(502).send({
          error: {
            type: 'bad_gateway',
            message: 'Failed to connect to Anthropic API'
          }
        });
      }
    }
  }

  async start(): Promise<void> {
    try {
      // Only bind to localhost for security
      const address = await this.fastify.listen({
        port: this.port,
        host: '127.0.0.1'
      });

      console.log(`🚀 Anthropic proxy server running at ${address}`);
      console.log(`📡 Proxying all requests to ${ANTHROPIC_API_BASE}`);
    } catch (error) {
      this.fastify.log.error(error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.fastify.close();
      console.log('✅ Proxy server stopped gracefully');
    } catch (error) {
      this.fastify.log.error(error);
      throw error;
    }
  }
}

// CLI entry point
async function main(): Promise<void> {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;
  const proxy = new AnthropicProxy(port);

  // Graceful shutdown handling
  const shutdown = async (): Promise<void> => {
    console.log('\n🛑 Received shutdown signal, stopping server...');
    try {
      await proxy.stop();
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  try {
    await proxy.start();
  } catch (error) {
    console.error('❌ Failed to start proxy server:', error);
    process.exit(1);
  }
}

// Export for testing
export { AnthropicProxy };

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}