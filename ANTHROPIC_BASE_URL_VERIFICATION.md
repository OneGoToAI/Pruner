# ANTHROPIC_BASE_URL Verification Documentation

## Overview

This document details the verification process for testing whether the Claude CLI process reads and respects the `ANTHROPIC_BASE_URL` environment variable for API request routing.

## Verification Setup

### Files Created

1. **`test-server.js`** - Custom Node.js HTTP server that:
   - Listens on port 8888 (configurable)
   - Logs all incoming requests with full details (headers, body, timestamp)
   - Returns mock Anthropic API-compatible responses
   - Handles CORS headers for browser compatibility

2. **`verify-anthropic-base-url.sh`** - Automated verification script that:
   - Tests both npx http-server and custom server setups
   - Provides manual testing instructions
   - Includes connectivity verification
   - Offers comprehensive logging and status reporting

### Technical Verification

✅ **Server Setup Verified**: Custom HTTP server successfully starts and listens on port 8888

✅ **Request Capture Verified**: Server successfully captures and logs HTTP requests with full details:
```
=== INCOMING REQUEST ===
Timestamp: 2026-03-20T07:31:06.489Z
Method: POST
URL: /v1/messages
Path: /v1/messages
Query: {}
Headers:
  host: 127.0.0.1:8888
  user-agent: curl/8.14.1
  accept: */*
  content-type: application/json
  content-length: 88
Body:
{
  "model": "claude-3-sonnet-20240229",
  "messages": [
    {
      "role": "user",
      "content": "test"
    }
  ]
}
========================
```

✅ **Mock Response Verified**: Server returns proper Anthropic API-compatible responses:
```json
{
  "id": "msg_mock_response",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "This is a mock response from the test server. If you see this, the ANTHROPIC_BASE_URL environment variable is working!"
    }
  ],
  "model": "claude-3-sonnet-20240229",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 10,
    "output_tokens": 25
  }
}
```

## Manual Testing Instructions

### Step 1: Start the Test Server

```bash
# Start the test server
node test-server.js
```

You should see:
```
🔍 Test HTTP Server running on http://127.0.0.1:8888
📡 Waiting for claude requests...
🔧 Set ANTHROPIC_BASE_URL=http://127.0.0.1:8888 when running claude
⏹️  Press Ctrl+C to stop the server
```

### Step 2: Test Claude with ANTHROPIC_BASE_URL

In a separate terminal, run:

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8888 claude
```

Then send any message to Claude.

### Step 3: Observe Results

**If ANTHROPIC_BASE_URL is respected:**
- The test server will log the incoming HTTP request from Claude
- You should see detailed request logs in the server terminal
- Claude may return an error (expected, since we're sending mock responses)

**If ANTHROPIC_BASE_URL is NOT respected:**
- No requests will appear in the test server logs
- Claude will attempt to connect to the real Anthropic servers
- This would indicate the environment variable is being ignored

## Alternative Testing with http-server

For simpler setup, you can also use the basic http-server approach mentioned in the original issue:

```bash
# Terminal 1: Start basic HTTP server
npx http-server -p 8888

# Terminal 2: Test with claude
ANTHROPIC_BASE_URL=http://127.0.0.1:8888 claude
```

## Expected Outcomes

### Scenario 1: ANTHROPIC_BASE_URL Works (Desired)
- ✅ Test server receives HTTP requests from Claude
- ✅ Requests match expected Anthropic API format (POST to `/v1/messages`)
- ✅ Headers include proper Content-Type and API keys
- ✅ Request body contains message payload

### Scenario 2: ANTHROPIC_BASE_URL Ignored (Risk)
- ❌ No requests received by test server
- ❌ Claude continues using real Anthropic servers
- ❌ **CRITICAL**: Entire proxy architecture approach is not viable
- ❌ **CRITICAL**: Need to evaluate alternative approaches (mitmproxy, etc.)

## Risk Assessment

### Critical Risk
If Claude does not respect the `ANTHROPIC_BASE_URL` environment variable, the entire project foundation is at risk. This would mean:

1. **Proxy Architecture Not Viable**: Cannot intercept Claude's requests using environment variable redirection
2. **Need Alternative Approach**: Must pivot to more complex solutions like:
   - mitmproxy with system proxy configuration
   - Network-level interception
   - Binary patching or dynamic linking approaches
   - Container-based network isolation

### Mitigation Strategy
If ANTHROPIC_BASE_URL is not respected:
1. **Immediate**: Document the finding and halt current approach
2. **Research**: Investigate mitmproxy setup as mentioned in the issue
3. **Architecture Review**: Re-evaluate the entire proxy strategy
4. **Timeline Impact**: Significant delay while exploring alternatives

## Validation Checklist

- [x] Test server successfully starts and listens
- [x] Server captures HTTP requests with full logging
- [x] Server returns API-compatible responses
- [x] Manual testing instructions documented
- [x] Risk scenarios identified and documented
- [x] **COMPLETED**: Manual claude testing with ANTHROPIC_BASE_URL
- [x] **COMPLETED**: Verification of actual Claude behavior

## Test Results - SUCCESSFUL ✅

### Manual Test Execution

**Test Command Executed:**
```bash
echo "Test message to verify ANTHROPIC_BASE_URL works" | ANTHROPIC_BASE_URL=http://127.0.0.1:8888 claude --print
```

**Actual Claude Response:**
```
This is a mock response from the test server. If you see this, the ANTHROPIC_BASE_URL environment variable is working!
```

### Verification Outcome

🎯 **SUCCESS**: Claude CLI **DOES** respect the `ANTHROPIC_BASE_URL` environment variable!

**Evidence:**
- Claude sent the HTTP request to our test server at `http://127.0.0.1:8888` instead of the real Anthropic API
- Claude received and displayed our mock response from the test server
- This conclusively proves that the environment variable overrides the default API endpoint

### Architectural Decision

✅ **GO**: The proxy architecture approach is **VIABLE**

## Next Steps

1. ✅ **CONFIRMED**: ANTHROPIC_BASE_URL environment variable works
2. ✅ **DECISION**: Proceed with proxy development approach
3. 📋 **NEXT PHASE**: Begin implementing the actual proxy server
4. 🛠️ **ARCHITECTURE**: Environment variable redirection is the correct foundation

---

*This verification is critical to the entire project success. The outcome determines whether the current architectural approach is viable or if a complete strategy change is required.*