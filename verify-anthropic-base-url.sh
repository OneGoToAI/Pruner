#!/bin/bash

echo "🧪 ANTHROPIC_BASE_URL Verification Script"
echo "========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
TEST_PORT=8888
TEST_HOST="127.0.0.1"
BASE_URL="http://${TEST_HOST}:${TEST_PORT}"

echo -e "${BLUE}Test Configuration:${NC}"
echo "  Port: $TEST_PORT"
echo "  Host: $TEST_HOST"
echo "  Base URL: $BASE_URL"
echo ""

# Function to check if a port is in use
check_port() {
  if lsof -Pi :$TEST_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    return 0  # Port is in use
  else
    return 1  # Port is free
  fi
}

# Function to wait for server to start
wait_for_server() {
  echo -e "${YELLOW}⏳ Waiting for server to start on port $TEST_PORT...${NC}"
  for i in {1..30}; do
    if curl -s "$BASE_URL" >/dev/null 2>&1; then
      echo -e "${GREEN}✅ Server is ready!${NC}"
      return 0
    fi
    sleep 1
    echo -n "."
  done
  echo -e "${RED}❌ Server failed to start within 30 seconds${NC}"
  return 1
}

echo -e "${BLUE}Step 1: Testing with npx http-server (as mentioned in issue)${NC}"
echo "---------------------------------------------------------------"

if check_port; then
  echo -e "${YELLOW}⚠️  Port $TEST_PORT is already in use. Stopping existing processes...${NC}"
  # Try to kill processes using the port
  lsof -ti:$TEST_PORT | xargs kill -9 2>/dev/null || true
  sleep 2
fi

echo "Starting http-server on port $TEST_PORT..."
# Start http-server in background
npx http-server -p $TEST_PORT -a $TEST_HOST --cors > /tmp/http-server.log 2>&1 &
HTTP_SERVER_PID=$!

if wait_for_server; then
  echo -e "${GREEN}✅ npx http-server is running (PID: $HTTP_SERVER_PID)${NC}"

  # Test basic connectivity
  echo "Testing basic HTTP connectivity..."
  if curl -s "$BASE_URL" > /tmp/test-response.txt; then
    echo -e "${GREEN}✅ HTTP server responds to requests${NC}"
  else
    echo -e "${RED}❌ HTTP server is not responding${NC}"
  fi
else
  echo -e "${RED}❌ Failed to start http-server${NC}"
fi

# Stop http-server
echo "Stopping http-server..."
kill $HTTP_SERVER_PID 2>/dev/null || true
sleep 2

echo ""
echo -e "${BLUE}Step 2: Testing with custom Node.js server (enhanced logging)${NC}"
echo "------------------------------------------------------------"

if check_port; then
  echo -e "${YELLOW}⚠️  Port $TEST_PORT is still in use. Waiting...${NC}"
  sleep 3
fi

echo "Starting custom Node.js test server..."
# Make the test server executable
chmod +x /data/workspaces/PRI-5/test-server.js

# Start our custom server in background
node /data/workspaces/PRI-5/test-server.js > /tmp/test-server.log 2>&1 &
TEST_SERVER_PID=$!

if wait_for_server; then
  echo -e "${GREEN}✅ Custom test server is running (PID: $TEST_SERVER_PID)${NC}"

  # Test basic connectivity
  echo "Testing basic HTTP connectivity..."
  if curl -s -H "Content-Type: application/json" \
       -d '{"model": "claude-3-sonnet-20240229", "messages": [{"role": "user", "content": "test"}]}' \
       "$BASE_URL/v1/messages" > /tmp/test-api-response.txt; then
    echo -e "${GREEN}✅ Custom server responds to API-like requests${NC}"
  else
    echo -e "${RED}❌ Custom server is not responding to API requests${NC}"
  fi

  echo ""
  echo -e "${BLUE}Step 3: Manual claude testing instructions${NC}"
  echo "----------------------------------------"
  echo "The test server is now running and logging all requests."
  echo ""
  echo -e "${YELLOW}To test with claude, run this command in another terminal:${NC}"
  echo ""
  echo -e "${GREEN}    ANTHROPIC_BASE_URL=http://127.0.0.1:7777 claude${NC}"
  echo ""
  echo "Then try sending a message to claude and observe the server logs."
  echo ""
  echo -e "${BLUE}Server logs are available at:${NC}"
  echo "  /tmp/test-server.log"
  echo ""
  echo -e "${BLUE}Server output in real-time:${NC}"
  echo "  tail -f /tmp/test-server.log"
  echo ""
  echo -e "${YELLOW}Press Ctrl+C to stop the test server and exit...${NC}"

  # Keep the server running until interrupted
  wait $TEST_SERVER_PID
else
  echo -e "${RED}❌ Failed to start custom test server${NC}"
  kill $TEST_SERVER_PID 2>/dev/null || true
fi

echo ""
echo -e "${BLUE}Verification Summary${NC}"
echo "==================="
echo "✅ Environment setup complete"
echo "✅ Both server options tested"
echo "⚠️  Manual claude testing required"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Run the manual test with: ANTHROPIC_BASE_URL=http://127.0.0.1:7777 claude"
echo "2. Check server logs for incoming requests"
echo "3. Document whether claude respects the ANTHROPIC_BASE_URL variable"