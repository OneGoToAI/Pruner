import fs from 'fs';
import path from 'path';
import os from 'os';

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

const DEFAULT_CONFIG: Config = {
  port: 7777,
  host: '127.0.0.1',
  logLevel: 'info',
  database: {
    path: path.join(os.homedir(), '.pruner', 'pruner.db')
  },
  optimizer: {
    cacheEnabled: true,
    maxTokens: 4096,
    pruningThreshold: 0.8
  },
  upstream: {
    url: 'https://api.anthropic.com',
    apiKey: ''
  }
};

function getConfigPath(): string {
  return path.join(os.homedir(), '.pruner', 'config.json');
}

function ensureConfigDirectory(): void {
  const configDir = path.join(os.homedir(), '.pruner');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

export function loadConfig(): Config {
  const configPath = getConfigPath();

  // Ensure config directory exists
  ensureConfigDirectory();

  // If config file doesn't exist, create it with default values
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }

  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData) as Config;

    // Merge with defaults to handle missing properties
    return {
      ...DEFAULT_CONFIG,
      ...config,
      database: { ...DEFAULT_CONFIG.database, ...config.database },
      optimizer: { ...DEFAULT_CONFIG.optimizer, ...config.optimizer },
      upstream: { ...DEFAULT_CONFIG.upstream, ...config.upstream }
    };
  } catch (error) {
    console.error('Error reading config file, using defaults:', error);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  ensureConfigDirectory();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}