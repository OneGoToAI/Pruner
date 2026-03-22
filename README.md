# Session Stats

Real-time tracking of session token and cost data for AI model requests.

## Features

- **In-memory session tracking**: Maintains session statistics in memory for real-time access
- **Token usage monitoring**: Tracks both input (original) and output (completion) tokens
- **Cost calculation**: Calculates saved costs based on configurable pricing
- **Multiple model support**: Works with any model name/identifier
- **TypeScript support**: Full TypeScript definitions included

## Installation

```bash
npm install
npm run build
```

## Usage

```typescript
import { recordRequest, getSessionStats, resetSession } from './dist/index';

// Record a request with token usage
recordRequest(1000, 500, 'gpt-4');
recordRequest(800, 400, 'claude-2');

// Get current session statistics
const stats = getSessionStats();
console.log({
  requests: stats.requests,        // 2
  origTokens: stats.origTokens,    // 1800
  compTokens: stats.compTokens,    // 900
  savedCost: stats.savedCost,      // calculated based on pricing config
  startedAt: stats.startedAt       // session start timestamp
});

// Reset session to start fresh
resetSession();
```

## API

### `recordRequest(orig: number, comp: number, model: string): void`

Records a new request with token usage data.

- `orig`: Number of original (input) tokens
- `comp`: Number of completion (output) tokens
- `model`: Model identifier (for reference, doesn't affect calculations)

### `getSessionStats(): SessionStats`

Returns current session statistics. The returned object is a copy and can be safely modified.

### `resetSession(): void`

Resets session statistics to initial state with a new start timestamp.

## Configuration

Pricing is configured with the following default values (per million tokens):

- Input tokens: $3.00
- Cache read tokens: $0.30
- Cache write tokens: $3.75

## Testing

```bash
npm test
```

## Building

```bash
npm run build
```

Built files will be available in the `dist/` directory with full TypeScript declarations.