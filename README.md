# Pruner - Token Compression Proxy for Claude API

A proxy server that compresses tokens in Claude API requests and provides real-time token statistics logging.

## Features

- **Token Compression**: Reduces token count in Claude API requests (mock implementation)
- **Real-time Statistics**: Prints colored token statistics after each request
- **Graceful Fallback**: Handles compression engine failures with passthrough mode
- **Number Formatting**: Displays token counts with thousand separators
- **Colored Output**: Uses chalk for beautiful console output

## Implementation Details

### Token Statistics Output Format

The system prints token statistics in the following format after each `POST /v1/messages` request:

```
[Pruner] ↓ 压缩: 4,231 → 1,052 tokens (-75.1%) | 节省: $0.010
```

**Color coding:**
- Blue: `[Pruner]` label
- Cyan: ↓ compression arrow
- Green: Compression percentage and savings (when > 0)
- Gray: Zero compression or passthrough mode

### Passthrough Mode

When the compression engine fails or is degraded, the system shows:

```
[Pruner] → 透传: 4,231 tokens | 无压缩
```

## Project Structure

```
src/
├── proxy.ts          # Main proxy server with token logging
├── index.ts           # Application entry point
└── __tests__/
    └── proxy.test.ts  # Comprehensive test suite
```

## Key Functions

### `calculateTokenStats(originalTokens, compressedTokens)`
Calculates compression statistics including ratio and cost savings.

### `printTokenStats(stats, isPassthrough)`
Prints formatted token statistics to console with colored output.

### `formatNumber(num)`
Formats numbers with thousand separators (e.g., 4231 → 4,231).

### `compressMessages(messages)`
Mock compression function (replace with actual compression engine).

### `createProxyRouter()`
Express router handling `/v1/messages` POST requests.

## API Endpoints

### `POST /v1/messages`
Proxies Claude API requests with token compression and logging.

**Request:**
```json
{
  "model": "claude-3.5-sonnet-20241022",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "max_tokens": 100
}
```

**Response:**
```json
{
  "id": "msg_1234567890",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Response"}],
  "model": "claude-3.5-sonnet-20241022",
  "usage": {
    "input_tokens": 1052,
    "output_tokens": 150
  }
}
```

### `GET /health`
Health check endpoint.

## Running the Application

### Development
```bash
npm install
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Testing
```bash
npm test
```

## Environment Variables

- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 0.0.0.0)
- `NODE_ENV`: Environment mode

## Implementation Requirements Met

✅ **Token Statistics Logging**: Implemented after each `POST /v1/messages` request
✅ **Chalk Coloring**: Blue/cyan/green colored output
✅ **Number Formatting**: Thousand separators (4,231)
✅ **Compression Display**: Shows original → compressed tokens with percentage
✅ **Cost Savings**: Displays estimated savings in USD
✅ **Fallback Handling**: Graceful degradation with passthrough mode
✅ **Chinese Text**: Supports Chinese characters in output
✅ **Comprehensive Tests**: Full test coverage for all functionality

## Next Steps

To integrate with a real compression engine:

1. Replace the mock `compressMessages()` function with actual compression logic
2. Add real Claude API forwarding (replace mock response)
3. Configure proper authentication for Claude API
4. Add production logging and monitoring
5. Implement caching and rate limiting as needed

## Testing

The project includes comprehensive tests covering:
- Token calculation and formatting functions
- Compression statistics
- Express API endpoints
- Error handling
- Edge cases (empty messages, malformed requests)

Run tests with: `npm test`