#!/usr/bin/env node

/**
 * Manual test script to verify the proxy server works correctly
 * Usage: npm run dev:test-proxy
 */

import { AnthropicProxy } from './proxy.js';

async function testProxy() {
  const port = 8082; // Use different port to avoid conflicts
  const proxy = new AnthropicProxy(port);

  try {
    console.log('🚀 Starting proxy server for manual testing...');
    await proxy.start();

    console.log('\n📋 Test commands you can run:');
    console.log(`curl -X GET http://127.0.0.1:${port}/v1/models`);
    console.log(`curl -X GET http://127.0.0.1:${port}/invalid/path`);
    console.log(`curl -X POST http://127.0.0.1:${port}/v1/messages \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -H "anthropic-version: 2023-06-01" \\`);
    console.log(`  -d '{"model":"claude-3-sonnet-20240229","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'`);

    console.log('\n⏱️  Server will run for 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('❌ Error testing proxy:', error);
  } finally {
    console.log('\n🛑 Stopping proxy server...');
    await proxy.stop();
  }
}

// Run the test
testProxy().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});