#!/usr/bin/env node

import { spawn, ChildProcess } from 'child_process';
import { loadConfig } from './config';
import { startProxy, ProxyServer } from './proxy';
import { checkClaudeCommand, findAvailablePort } from './utils';
import { parseArgs, handleSpecialCommand } from './cli';
import { printFinalReport } from './stats/report';
import { showErrorMessage, showInfoMessage } from './ui/banner';

interface ProcessState {
  proxyServer?: ProxyServer;
  claudeProcess?: ChildProcess;
  isShuttingDown: boolean;
}

const state: ProcessState = {
  isShuttingDown: false
};

async function main() {
  const { command, claudeArgs } = parseArgs(process.argv);

  // Handle special commands that don't require claude
  if (command) {
    const handled = await handleSpecialCommand(command);
    if (handled) {
      process.exit(0);
    }
  }

  // Check if claude command exists
  showInfoMessage('Checking for claude command...');
  const claudeExists = await checkClaudeCommand();
  if (!claudeExists) {
    showErrorMessage('claude command not found. Please install Claude Desktop or ensure it\'s in your PATH.');
    process.exit(1);
  }

  // Load configuration
  const config = loadConfig();

  // Find available port
  showInfoMessage(`Checking port availability (starting from ${config.port})...`);
  const availablePort = await findAvailablePort(config.port);
  if (availablePort !== config.port) {
    showInfoMessage(`Port ${config.port} was occupied, using port ${availablePort}`);
  }

  // Start proxy server
  showInfoMessage(`Starting proxy server on port ${availablePort}...`);
  try {
    state.proxyServer = await startProxy(availablePort);
    showInfoMessage('Proxy server ready');
  } catch (error) {
    showErrorMessage(`Failed to start proxy server: ${error}`);
    process.exit(1);
  }

  // Construct environment variables
  const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${availablePort}`
  };

  // Start claude subprocess
  showInfoMessage('Starting claude...');
  try {
    state.claudeProcess = spawn('claude', claudeArgs, {
      stdio: 'inherit',
      env
    });

    // Handle claude process exit
    state.claudeProcess.on('exit', async (code, signal) => {
      if (!state.isShuttingDown) {
        console.log(`\nClaude exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`);
        await shutdown();
      }
    });

    state.claudeProcess.on('error', (error) => {
      showErrorMessage(`Error starting claude: ${error.message}`);
      shutdown().then(() => process.exit(1));
    });

  } catch (error) {
    showErrorMessage(`Failed to start claude: ${error}`);
    await shutdown();
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  if (state.isShuttingDown) {
    return; // Already shutting down
  }

  state.isShuttingDown = true;

  console.log('\n🛑 Shutting down...');

  // Print final report
  if (state.proxyServer?.stats) {
    printFinalReport(state.proxyServer.stats);
  }

  // Gracefully terminate claude process
  if (state.claudeProcess && !state.claudeProcess.killed) {
    state.claudeProcess.kill('SIGTERM');

    // Wait a bit for graceful shutdown, then force kill if needed
    setTimeout(() => {
      if (state.claudeProcess && !state.claudeProcess.killed) {
        state.claudeProcess.kill('SIGKILL');
      }
    }, 5000);
  }

  // Close proxy server
  if (state.proxyServer) {
    try {
      await state.proxyServer.close();
    } catch (error) {
      console.error('Error closing proxy server:', error);
    }
  }

  console.log('👋 Goodbye!');
}

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT (Ctrl+C)');
  await shutdown();
  process.exit(0);
});

// Handle SIGTERM
process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM');
  await shutdown();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error);
  await shutdown();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  await shutdown();
  process.exit(1);
});

// Run the application
main().catch(async (error) => {
  showErrorMessage(`Failed to start Pruner: ${error.message}`);
  await shutdown();
  process.exit(1);
});