/**
 * Example demonstrating the banner and reporting functionality
 */

import { initializeSession, recordRequest, finalizeSession } from './stats/report';
import { printStartupBanner, printFinalReport, setupExitHandlers } from './ui/banner';

/**
 * Simulate a Pruner session with startup banner and final report
 */
async function simulateSession(): Promise<void> {
  console.log('=== Pruner Session Simulation ===\n');

  // 1. Print startup banner
  printStartupBanner({
    version: '1.0.0',
    port: 8080,
    showDetailedStats: true
  });

  // 2. Initialize session tracking
  const session = initializeSession();

  // 3. Setup exit handlers (in a real app, this would be done once at startup)
  setupExitHandlers(() => {
    const currentSession = session;
    return currentSession ? currentSession.getSessionStats() : null;
  });

  // 4. Simulate some API requests with token compression
  console.log('Simulating API requests...\n');

  // Request 1: Good compression
  recordRequest(10000, 7500);
  console.log('✓ Request 1: 10,000 → 7,500 tokens (25% savings)');

  // Request 2: Excellent compression
  recordRequest(8000, 4000);
  console.log('✓ Request 2: 8,000 → 4,000 tokens (50% savings)');

  // Request 3: Moderate compression
  recordRequest(5000, 4200);
  console.log('✓ Request 3: 5,000 → 4,200 tokens (16% savings)');

  // Request 4: Small request, good compression
  recordRequest(2000, 1000);
  console.log('✓ Request 4: 2,000 → 1,000 tokens (50% savings)');

  // 5. Show intermediate stats
  const intermediateStats = session.getSessionStats();
  console.log(`\n--- Intermediate Stats ---`);
  console.log(`Requests processed: ${intermediateStats.requestCount}`);
  console.log(`Total tokens saved: ${(intermediateStats.originalTokens - intermediateStats.compressedTokens).toLocaleString()}`);
  console.log(`Average savings: ${intermediateStats.savingsPercentage.toFixed(1)}%`);
  console.log(`Session duration: ${session.getSessionDurationString()}\n`);

  // 6. Finalize session and get final stats
  const finalStats = finalizeSession();

  // 7. Print final report
  if (finalStats) {
    printFinalReport(finalStats);
  }

  console.log('=== Session Complete ===');
}

/**
 * Simulate a session with zero requests
 */
async function simulateEmptySession(): Promise<void> {
  console.log('\n=== Empty Session Simulation ===\n');

  // Print startup banner
  printStartupBanner({
    version: '1.0.0',
    port: 8080,
    showDetailedStats: true
  });

  // Initialize session but don't record any requests
  initializeSession();
  console.log('Session initialized, but no requests processed...\n');

  // Finalize immediately
  const finalStats = finalizeSession();

  // Print final report (should show friendly empty message)
  if (finalStats) {
    printFinalReport(finalStats);
  }

  console.log('=== Empty Session Complete ===');
}

/**
 * Run the demonstrations
 */
async function runDemo(): Promise<void> {
  try {
    // Run normal session simulation
    await simulateSession();

    // Wait a bit between simulations
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Run empty session simulation
    await simulateEmptySession();

  } catch (error) {
    console.error('Demo error:', error);
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}

export { simulateSession, simulateEmptySession };