# Pruner Proxy

A Fastify-based HTTP proxy server that forwards requests to the Anthropic API. This proxy provides local request optimization and processing capabilities while maintaining full compatibility with the Anthropic API.

## Features

- **Local-only binding**: Only listens on `127.0.0.1` for security
- **Complete API compatibility**: All Anthropic API endpoints are supported
- **Streaming support**: Handles Server-Sent Events (SSE) for streaming responses
- **Header forwarding**: Preserves all necessary headers (`x-api-key`, `anthropic-version`, etc.)
- **Error handling**: Proper timeout handling (120s) and error passthrough
- **HTTP/1.1 compliant**: Handles response headers correctly

## Installation

```bash
npm install
```

## Usage

### Development Mode

Start the proxy server in development mode with hot reloading:

```bash
npm run dev
```

The server will start on `http://127.0.0.1:8080` by default.

### Production Mode

Build and run in production:

```bash
npm run build
npm start
```

### Custom Port

Set a custom port using the `PORT` environment variable:

```bash
PORT=3000 npm run dev
```

## API Routes

All routes are proxied to `https://api.anthropic.com`:

- `POST /v1/messages` - Chat completions (streaming and non-streaming)
- `GET /v1/models` - List available models
- All other Anthropic API endpoints are supported

## Configuration

### Required Headers

When making requests through the proxy, include the same headers you would use with the Anthropic API:

```bash
curl -X POST http://127.0.0.1:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Streaming Requests

The proxy automatically detects and handles streaming responses:

```bash
curl -X POST http://127.0.0.1:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1024,
    "stream": true,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Development

### Running Tests

```bash
npm test
```

### Manual Testing

Run the interactive test script:

```bash
npm run dev:test
```

This starts a test server for 30 seconds with example curl commands.

### Linting and Formatting

```bash
npm run lint
npm run format
```

## Error Handling

- **Network timeouts**: Returns `504 Gateway Timeout` after 120 seconds
- **Anthropic API errors**: All `4xx` and `5xx` errors are passed through unchanged
- **Connection errors**: Returns `502 Bad Gateway` for connection failures

## Architecture

The proxy is built with:

- **Fastify**: High-performance web framework
- **undici**: Modern HTTP/1.1 client for Node.js
- **TypeScript**: Type-safe development
- **Vitest**: Fast testing framework

## Security

- Only binds to `127.0.0.1` (localhost) - not accessible from external networks
- Does not log or store API keys or request contents
- Forwards all security headers without modification