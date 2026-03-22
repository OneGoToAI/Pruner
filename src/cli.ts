import path from 'path';
import os from 'os';
import fs from 'fs';
import { loadConfig } from './config';
import { openConfigInEditor } from './utils';
import { StatsDatabase } from './stats/db';
import { StatsCounter } from './stats/counter';
import { StatsReporter } from './stats/report';

export function parseArgs(args: string[]): { command?: string; claudeArgs: string[] } {
  const [, , ...processArgs] = args; // Remove 'node' and script path

  if (processArgs.length === 0) {
    return { claudeArgs: [] };
  }

  const firstArg = processArgs[0];

  // Check for special commands
  if (firstArg === 'stats') {
    return { command: 'stats', claudeArgs: [] };
  }

  if (firstArg === 'config') {
    return { command: 'config', claudeArgs: [] };
  }

  if (firstArg === 'reset') {
    return { command: 'reset', claudeArgs: [] };
  }

  // All arguments are passed to claude
  return { claudeArgs: processArgs };
}

export async function handleStatsCommand(): Promise<void> {
  try {
    const config = loadConfig();
    const statsDb = new StatsDatabase(config);
    const statsCounter = new StatsCounter(); // This will have empty stats since we're not running
    const reporter = new StatsReporter(statsCounter, statsDb);

    console.log('📊 Pruner Statistics Report');
    console.log('===========================\n');

    // Get total historical stats
    const totalStats = statsDb.getTotalStats();

    if (totalStats.total_requests === 0) {
      console.log('No statistics available. Run some claude commands through pruner first.');
      return;
    }

    console.log(`Total Requests: ${totalStats.total_requests}`);
    console.log(`Total Errors: ${totalStats.total_errors}`);
    console.log(`Total Tokens Processed: ${totalStats.total_tokens}`);
    console.log(`Total Cache Hits: ${totalStats.total_cache_hits}`);
    console.log(`Average Response Time: ${totalStats.avg_response_time.toFixed(2)}ms`);
    console.log(`First Request: ${totalStats.first_request}`);
    console.log(`Last Request: ${totalStats.last_request}`);

    const cacheHitRate = totalStats.total_cache_hits / totalStats.total_requests * 100;
    const errorRate = totalStats.total_errors / totalStats.total_requests * 100;

    console.log(`\nCache Hit Rate: ${cacheHitRate.toFixed(1)}%`);
    console.log(`Error Rate: ${errorRate.toFixed(1)}%`);

    statsDb.close();
  } catch (error) {
    console.error('Error loading statistics:', error);
    process.exit(1);
  }
}

export async function handleConfigCommand(): Promise<void> {
  const configPath = path.join(os.homedir(), '.pruner', 'config.json');

  try {
    // Ensure config exists
    loadConfig();

    console.log(`Opening config file: ${configPath}`);
    await openConfigInEditor(configPath);
    console.log('Config file closed.');
  } catch (error) {
    console.error('Error opening config file:', error);
    process.exit(1);
  }
}

export async function handleResetCommand(): Promise<void> {
  const config = loadConfig();

  try {
    // Remove database file if it exists
    if (fs.existsSync(config.database.path)) {
      fs.unlinkSync(config.database.path);
      console.log('✅ Statistics data has been reset.');
    } else {
      console.log('ℹ️  No statistics data found to reset.');
    }
  } catch (error) {
    console.error('Error resetting statistics:', error);
    process.exit(1);
  }
}

export async function handleSpecialCommand(command: string): Promise<boolean> {
  switch (command) {
    case 'stats':
      await handleStatsCommand();
      return true;

    case 'config':
      await handleConfigCommand();
      return true;

    case 'reset':
      await handleResetCommand();
      return true;

    default:
      return false;
  }
}