#!/usr/bin/env node

import { startServer } from './proxy';
import { showBanner } from './ui/banner';
import { loadConfig } from './config';

async function main() {
  // Show banner
  showBanner();

  // Load configuration
  const config = loadConfig();

  // Start the proxy server
  await startServer(config);
}

// Run the application
main().catch((error) => {
  console.error('Failed to start Pruner:', error);
  process.exit(1);
});