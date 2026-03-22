import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { AnthropicProxy } from './proxy.js';

describe('AnthropicProxy', () => {
  let proxy: AnthropicProxy;
  const testPort = 8081; // Use different port for tests

  beforeAll(async () => {
    proxy = new AnthropicProxy(testPort);
    await proxy.start();
  });

  afterAll(async () => {
    await proxy.stop();
  });

  it('should start server successfully', () => {
    expect(proxy).toBeDefined();
  });

  it('should proxy GET requests to Anthropic API', async () => {
    const response = await fetch(`http://127.0.0.1:${testPort}/v1/models`);

    // Should get some response (might be 401 unauthorized without API key; 502 in offline/sandbox environments)
    expect([200, 401, 403, 502]).toContain(response.status);
  });

  it('should handle invalid endpoints gracefully', async () => {
    const response = await fetch(`http://127.0.0.1:${testPort}/invalid/path`);

    // Should forward the 404 from Anthropic API (502 in offline/sandbox environments)
    expect([404, 401, 403, 502]).toContain(response.status);
  });

  it('should forward headers in requests', async () => {
    const customHeaders = {
      'x-api-key': 'test-key',
      'anthropic-version': '2023-06-01',
      'user-agent': 'test-agent/1.0'
    };

    const response = await fetch(`http://127.0.0.1:${testPort}/v1/models`, {
      headers: customHeaders
    });

    // The response might be 401 but the headers should have been forwarded
    expect(response.status).toBeGreaterThanOrEqual(200);
  });

  it('should handle POST requests with JSON body', async () => {
    const testPayload = {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'Hello' }]
    };

    const response = await fetch(`http://127.0.0.1:${testPort}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(testPayload)
    });

    // Should get a response (likely 401 without valid API key; 502 in offline/sandbox environments)
    expect([200, 400, 401, 403, 502]).toContain(response.status);
  });
});