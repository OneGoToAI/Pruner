#!/usr/bin/env node

const http = require('http');
const url = require('url');

const PORT = 8888;
const HOST = '127.0.0.1';

// Create HTTP server to capture claude requests
const server = http.createServer((req, res) => {
  const timestamp = new Date().toISOString();
  const parsedUrl = url.parse(req.url, true);

  console.log('\n=== INCOMING REQUEST ===');
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Method: ${req.method}`);
  console.log(`URL: ${req.url}`);
  console.log(`Path: ${parsedUrl.pathname}`);
  console.log(`Query: ${JSON.stringify(parsedUrl.query, null, 2)}`);
  console.log('Headers:');
  Object.entries(req.headers).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });

  let body = '';

  // Collect request body
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    if (body) {
      console.log('Body:');
      try {
        // Try to pretty print JSON if possible
        const jsonBody = JSON.parse(body);
        console.log(JSON.stringify(jsonBody, null, 2));
      } catch (e) {
        console.log(body);
      }
    }
    console.log('========================\n');

    // Send CORS headers to avoid browser issues
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version'
    });

    // Send a mock response that looks like an Anthropic API response
    const mockResponse = {
      id: "msg_mock_response",
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: "This is a mock response from the test server. If you see this, the ANTHROPIC_BASE_URL environment variable is working!"
        }
      ],
      model: "claude-3-sonnet-20240229",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 25
      }
    };

    res.end(JSON.stringify(mockResponse, null, 2));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`🔍 Test HTTP Server running on http://${HOST}:${PORT}`);
  console.log('📡 Waiting for claude requests...');
  console.log(`🔧 Set ANTHROPIC_BASE_URL=http://${HOST}:${PORT} when running claude`);
  console.log('⏹️  Press Ctrl+C to stop the server\n');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down test server...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});