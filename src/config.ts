export interface Config {
  port: number;
  host: string;
  logLevel: string;
  database: {
    path: string;
  };
  optimizer: {
    cacheEnabled: boolean;
    maxTokens: number;
    pruningThreshold: number;
  };
  upstream: {
    url: string;
    apiKey: string;
  };
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PRUNER_PORT || '3000', 10),
    host: process.env.PRUNER_HOST || '0.0.0.0',
    logLevel: process.env.PRUNER_LOG_LEVEL || 'info',
    database: {
      path: process.env.PRUNER_DB_PATH || './pruner.db'
    },
    optimizer: {
      cacheEnabled: process.env.PRUNER_CACHE_ENABLED === 'true' || true,
      maxTokens: parseInt(process.env.PRUNER_MAX_TOKENS || '4096', 10),
      pruningThreshold: parseFloat(process.env.PRUNER_PRUNING_THRESHOLD || '0.8')
    },
    upstream: {
      url: process.env.PRUNER_UPSTREAM_URL || 'https://api.openai.com',
      apiKey: process.env.PRUNER_UPSTREAM_API_KEY || ''
    }
  };
}