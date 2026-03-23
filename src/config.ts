// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Proprietary and confidential. Unauthorized use prohibited.

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface OptimizerConfig {
  enablePromptCache: boolean;
  enableContextPruning: boolean;
  enableTruncation: boolean;
  maxMessages: number;
  maxToolOutputChars: number;
  /**
   * When true, Pruner calls Anthropic's /v1/messages/count_tokens endpoint
   * (in parallel with the main request, zero added latency) to get an exact
   * token count instead of the tiktoken estimate. This makes savings figures
   * verifiably accurate. Disable if you want to avoid the extra API call.
   */
  accurateTokenCounting: boolean;
}

export interface PricingConfig {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWritePerMillion: number;
  cacheReadPerMillion: number;
}

export interface PrunerConfig {
  proxyPort: number;
  optimizer: OptimizerConfig;
  pricing: PricingConfig;
}

const CONFIG_DIR = join(homedir(), '.pruner');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: PrunerConfig = {
  proxyPort: 7777,
  optimizer: {
    enablePromptCache: true,
    enableContextPruning: true,
    enableTruncation: true,
    maxMessages: 20,
    maxToolOutputChars: 3000,
    accurateTokenCounting: true,
  },
  pricing: {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
};

let cachedConfig: PrunerConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 1000;

function deepMerge(base: PrunerConfig, override: Partial<PrunerConfig>): PrunerConfig {
  return {
    proxyPort: override.proxyPort ?? base.proxyPort,
    optimizer: { ...base.optimizer, ...override.optimizer },
    pricing: { ...base.pricing, ...override.pricing },
  };
}

function loadFromDisk(): PrunerConfig {
  if (!existsSync(CONFIG_FILE)) {
    return DEFAULT_CONFIG;
  }
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    return deepMerge(DEFAULT_CONFIG, raw);
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Get the current config. Re-reads from disk at most once per second
 * so config edits take effect without restarting pruner.
 */
export function getConfig(): Readonly<PrunerConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }

  // Only re-read if file mtime changed (avoids unnecessary JSON.parse)
  if (cachedConfig && existsSync(CONFIG_FILE)) {
    try {
      const mtime = statSync(CONFIG_FILE).mtimeMs;
      if (mtime <= cacheTimestamp) {
        cacheTimestamp = now;
        return cachedConfig;
      }
    } catch { /* fall through to full reload */ }
  }

  cachedConfig = loadFromDisk();
  cacheTimestamp = now;
  return cachedConfig;
}

/**
 * Ensure ~/.pruner/ exists and config.json is written with defaults
 * if it doesn't exist yet. Called once at startup.
 */
export function initConfig(): PrunerConfig {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
  cachedConfig = loadFromDisk();
  cacheTimestamp = Date.now();
  return cachedConfig;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigFilePath(): string {
  return CONFIG_FILE;
}
