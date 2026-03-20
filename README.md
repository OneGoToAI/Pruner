# Phase 0: ANTHROPIC_BASE_URL Verification

> **Critical Risk Assessment**: This verification determines if the entire proxy architecture approach is viable.

## Quick Start

1. **Start the verification server:**
   ```bash
   node test-server.js
   ```

2. **Test Claude with environment variable:**
   ```bash
   ANTHROPIC_BASE_URL=http://127.0.0.1:8888 claude
   ```

3. **Check server logs** for incoming requests from Claude

## Files Overview

- `test-server.js` - HTTP server that captures and logs all Claude requests
- `verify-anthropic-base-url.sh` - Automated verification script
- `ANTHROPIC_BASE_URL_VERIFICATION.md` - Comprehensive documentation and analysis

## Critical Decision Point

**✅ If Claude sends requests to our test server**:
- ANTHROPIC_BASE_URL works → Proceed with proxy development
- Foundation is solid, architecture is viable

**❌ If no requests appear in server logs**:
- ANTHROPIC_BASE_URL ignored → HALT and pivot to mitmproxy
- Current approach not viable, major architecture change required

## Environment Requirements

- Node.js (for test server)
- curl (for connectivity testing)
- Claude CLI (for actual verification)

## Expected Test Flow

1. Server starts on `http://127.0.0.1:8888`
2. Claude CLI launched with `ANTHROPIC_BASE_URL=http://127.0.0.1:8888`
3. User sends message to Claude
4. **CRITICAL**: Server should log the HTTP request from Claude
5. Claude may error (expected, since we return mock responses)

## Success Criteria

- HTTP POST request to `/v1/messages` logged by test server
- Request contains proper Anthropic API payload structure
- Headers include authentication and content-type

## Risk Mitigation

If ANTHROPIC_BASE_URL verification fails:
- Document the limitation immediately
- Research mitmproxy as fallback approach
- Re-evaluate entire project timeline and architecture

---

**Status**: ✅ **VERIFICATION COMPLETE AND SUCCESSFUL**

✅ **CONFIRMED**: Claude CLI respects ANTHROPIC_BASE_URL environment variable
✅ **EVIDENCE**: Server logs show HTTP POST requests from Claude to test server
✅ **DECISION**: Proxy architecture is viable - proceed with development

See `VERIFICATION_RESULTS.md` for complete evidence and analysis.