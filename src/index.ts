#!/usr/bin/env node
// Copyright (c) 2026 OneGoToAI. All Rights Reserved.
// Licensed under the MIT License. See LICENSE in the project root.

import { spawn, execSync } from 'child_process';
import net from 'net';
import chalk from 'chalk';
import Table from 'cli-table3';
import { initConfig, getConfig, getConfigFilePath } from './config.js';
import { startProxy, setDebugMode } from './proxy.js';
import { getStats, resetSession } from './stats/session.js';

async function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('listening', () => {
      server.close(() => resolve(startPort));
    });
    server.once('error', () => {
      resolve(findAvailablePort(startPort + 1));
    });
    server.listen(startPort, '127.0.0.1');
  });
}

function checkClaudeExists(): boolean {
  try {
    execSync('which claude', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function printFinalReport(): void {
  const stats = getStats();
  if (stats.requests === 0) return;

  const duration = Math.round((Date.now() - stats.startedAt.getTime()) / 1000);
  const prunedTokens = Math.max(0, stats.origTokens - stats.compTokens);
  const prunePct = stats.origTokens > 0
    ? (prunedTokens / stats.origTokens * 100).toFixed(1)
    : '0.0';

  const allVerified = stats.verifiedRequests === stats.requests;
  const someVerified = stats.verifiedRequests > 0;
  const verifiedBadge = allVerified
    ? chalk.green('✓ verified')
    : someVerified
      ? chalk.dim(`~${stats.verifiedRequests}/${stats.requests} verified`)
      : chalk.dim('~ estimated');

  const table = new Table({
    head: [
      chalk.bold.green('Pruner') + chalk.dim('  ·  Session Report'),
      verifiedBadge,
    ],
    style: {
      head: [],
      border: ['dim'],
    },
    chars: {
      top: '─', 'top-mid': '┬', 'top-left': '╭', 'top-right': '╮',
      bottom: '─', 'bottom-mid': '┴', 'bottom-left': '╰', 'bottom-right': '╯',
      left: '│', 'left-mid': '├', mid: '─', 'mid-mid': '┼',
      right: '│', 'right-mid': '┤', middle: '│',
    },
    colWidths: [28, 24],
  });

  table.push(
    [chalk.dim('Requests'),        chalk.white(String(stats.requests))],
    [chalk.dim('Original tokens'), chalk.white(stats.origTokens.toLocaleString('en-US'))],
    [chalk.dim('After pruning'),   chalk.white(stats.compTokens.toLocaleString('en-US'))],
    [chalk.dim('Pruning saved'),   chalk.green(`↓${prunePct}%`) + chalk.dim('  ') + chalk.yellow(`$${stats.pruneSavedCost.toFixed(4)}`)],
  );

  if (stats.cacheHitTokens > 0) {
    table.push(
      [chalk.dim('Cache hit tokens'), chalk.magenta(stats.cacheHitTokens.toLocaleString('en-US')) + chalk.green(' ✓')],
      [chalk.dim('Cache saved'),      chalk.yellow(`$${stats.cacheHitSavedCost.toFixed(4)}`)],
    );
  }

  table.push(
    [chalk.bold('Total saved'), chalk.bold.yellow(`$${stats.savedCost.toFixed(4)}`)],
    [chalk.dim('Duration'),     chalk.white(`${duration}s`)],
  );

  process.stderr.write('\n' + table.toString() + '\n\n');
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  // --debug is a Pruner-only flag; strip it before passing args to claude
  const debugFlagIdx = rawArgs.indexOf('--debug');
  const isDebug = debugFlagIdx !== -1;
  const args = isDebug
    ? [...rawArgs.slice(0, debugFlagIdx), ...rawArgs.slice(debugFlagIdx + 1)]
    : rawArgs;

  if (isDebug) setDebugMode(true);

  const configPath = getConfigFilePath();

  // Special subcommands — don't start claude
  if (args[0] === 'stats') {
    process.stderr.write(chalk.yellow('[Pruner] stats command will be available in Phase 4 (after SQLite persistence)\n'));
    process.exit(0);
  }

  if (args[0] === 'reset') {
    resetSession();
    process.stderr.write(chalk.green('[Pruner] session data reset\n'));
    process.exit(0);
  }

  if (args[0] === 'config') {
    initConfig(); // ensure file exists
    const editor = process.env.VISUAL ?? process.env.EDITOR ?? 'open';
    spawn(editor, [configPath], { stdio: 'inherit', detached: true }).unref();
    process.exit(0);
  }

  if (!checkClaudeExists()) {
    process.stderr.write(
      chalk.red('[Pruner] error: claude command not found.\n') +
      chalk.dim('Please install Claude CLI from https://claude.ai/download\n')
    );
    process.exit(1);
  }

  const config = initConfig();
  const port = await findAvailablePort(config.proxyPort);

  if (port !== config.proxyPort) {
    process.stderr.write(
      chalk.yellow(`[Pruner] port ${config.proxyPort} in use, switching to ${port}\n`)
    );
  }

  const stopProxy = await startProxy(port);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
  };

  const child = spawn('claude', args, { stdio: 'inherit', env });

  let exiting = false;
  const shutdown = async (signal?: NodeJS.Signals): Promise<void> => {
    if (exiting) return;
    exiting = true;
    if (signal) child.kill(signal);
    await new Promise((r) => setTimeout(r, 200));
    printFinalReport();
    try { await stopProxy(); } catch { /* best-effort */ }
  };

  process.on('SIGINT', () => { /* let claude handle it */ });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  child.on('exit', async (code) => {
    await shutdown();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  process.stderr.write(chalk.red(`[Pruner] fatal error: ${err}\n`));
  process.exit(1);
});
