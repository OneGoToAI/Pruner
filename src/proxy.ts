import Fastify, { FastifyInstance } from 'fastify';
import { Config } from './config';
import { Optimizer, ChatRequest } from './optimizer';
import { StatsCounter } from './stats/counter';

export async function startServer(config: Config): Promise<void> {
  const fastify: FastifyInstance = Fastify({
    logger: {
      level: config.logLevel || 'info'
    }
  });

  const optimizer = new Optimizer(config);
  const stats = new StatsCounter();

  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Main proxy endpoint for LLM API requests
  fastify.post('/v1/chat/completions', async (request, reply) => {
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
  fastify.get('/stats', async (request, reply) => {
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