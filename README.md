# Pruner - Token Compression Proxy

A session reporting system for Claude API token compression.

## Features

### Session Reporting
- Tracks API requests, token usage, and compression statistics
- Calculates cost savings in real-time
- Displays beautiful formatted reports on session completion
- Persists cumulative statistics across sessions

### Banner Display
- Startup banner with version and port information
- Detailed final report with Unicode table formatting
- Friendly messages for sessions with zero requests
- Colorized output using chalk

## Usage

```typescript
import { initializeSession, recordRequest, finalizeSession } from './src/stats/report';
import { printStartupBanner, printFinalReport, setupExitHandlers } from './src/ui/banner';

// Initialize session
const session = initializeSession();

// Print startup banner
printStartupBanner({
  version: '1.0.0',
  port: 8080,
  showDetailedStats: true
});

// Setup exit handlers for automatic reporting
setupExitHandlers(() => session.getSessionStats());

// Record API requests
recordRequest(10000, 7500); // originalTokens, compressedTokens

// Finalize and display report
const finalStats = finalizeSession();
if (finalStats) {
  printFinalReport(finalStats);
}
```

## Example Output

### Normal Session
```
╔══════════════════════════════════════════╗
║         💰 Pruner 会话报告               ║
╠══════════════════════════════════════════╣
║  请求数        12                        ║
║  原始 Token    128,432                   ║
║  压缩后 Token   31,204                   ║
║  节省比例       75.7%                    ║
║  本次节省       $0.29                    ║
║  累计节省       $12.47                   ║
╚══════════════════════════════════════════╝
```

### Empty Session
```
╔══════════════════════════════════════════╗
║         💤 Pruner 会话报告               ║
╠══════════════════════════════════════════╣
║      本次会话未处理任何请求              ║
║      提示：代理已就绪，等待 API 请求     ║
╚══════════════════════════════════════════╝
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run example
npm run dev
# or
node dist/example.js
```

## Architecture

- **`src/types.ts`**: TypeScript type definitions
- **`src/stats/report.ts`**: Session statistics tracking and management
- **`src/ui/banner.ts`**: Banner and report display functionality
- **`src/example.ts`**: Usage demonstration
- **`tests/`**: Comprehensive test suite with mocks

## Dependencies

- **chalk**: Terminal colors and styling
- **cli-table3**: Unicode table formatting
- **TypeScript**: Type safety and modern JavaScript features
- **Jest**: Testing framework