import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Config } from './config';
import { Optimizer, ChatRequest } from './optimizer';
import { StatsCounter } from './stats/counter';

export interface ProxyServer {
  fastify: FastifyInstance;
  stats: StatsCounter;
  close: () => Promise<void>;
}

export async function startProxy(port: number): Promise<ProxyServer> {
  const config: Config = {
    port,
    host: '127.0.0.1',
    logLevel: 'warn', // Reduce logging for CLI usage
    database: {
      path: process.env.PRUNER_DB_PATH || './pruner.db'
    },
    optimizer: {
      cacheEnabled: true,
      maxTokens: 4096,
      pruningThreshold: 0.8
    },
    upstream: {
      url: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
      apiKey: process.env.ANTHROPIC_API_KEY || ''
    }
  };

  const fastify: FastifyInstance = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  const optimizer = new Optimizer(config);
  const stats = new StatsCounter();

  // Health check endpoint
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Main proxy endpoint for LLM API requests
  fastify.post('/v1/chat/completions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      stats.incrementRequest();

      // Process the request through the optimizer
      const optimizedResponse = await optimizer.process(request.body as ChatRequest);

      stats.incrementResponse();
      return optimizedResponse;
    } catch (error) {
      stats.incrementError();
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Statistics endpoint
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    return stats.getStats();
  });

  await fastify.listen({
    port,
    host: '127.0.0.1'
  });

  return {
    fastify,
    stats,
    close: async () => {
      await fastify.close();
    }
  };
}

// Keep the original function for backward compatibility
export async function startServer(config: Config): Promise<void> {
  const fastify: FastifyInstance = Fastify({
    logger: {
      level: config.logLevel || 'info'
    }
  });

  const optimizer = new Optimizer(config);
  const stats = new StatsCounter();

  // Health check endpoint
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Main proxy endpoint for LLM API requests
  fastify.post('/v1/chat/completions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      stats.incrementRequest();

      // Process the request through the optimizer
      const optimizedResponse = await optimizer.process(request.body as ChatRequest);

      stats.incrementResponse();
      return optimizedResponse;
    } catch (error) {
      stats.incrementError();
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Statistics endpoint
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    return stats.getStats();
  });

  try {
    await fastify.listen({
      port: config.port || 3000,
      host: config.host || '0.0.0.0'
    });

    console.log(`🚀 Pruner proxy server running on ${config.host || '0.0.0.0'}:${config.port || 3000}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}