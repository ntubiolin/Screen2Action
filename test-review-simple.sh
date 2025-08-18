#!/bin/bash

# Simple test script that assumes services are already running
# Usage: ./test-review-simple.sh [sessionId]

SESSION_ID=${1:-"cc8fb903-f5a0-4c88-877b-d4ef05d408dc"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Quick Review Page Test"
echo "📝 Session ID: $SESSION_ID"
echo ""

# Check if backend is running
if lsof -Pi :8765 -sTCP:LISTEN -t >/dev/null 2>/dev/null || nc -z localhost 8765 2>/dev/null ; then
    echo -e "${GREEN}✅ Backend is running${NC}"
else
    echo -e "${RED}❌ Backend is not running!${NC}"
    echo -e "${YELLOW}Please start it with:${NC}"
    echo "  cd backend"
    echo "  source .venv/bin/activate"
    echo "  python run.py"
    echo ""
fi

# Check if frontend is running
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>/dev/null || nc -z localhost 3000 2>/dev/null ; then
    echo -e "${GREEN}✅ Frontend is running${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend is not running. Starting it now...${NC}"
    npm run dev:renderer &
    echo "Waiting for frontend to start..."
    sleep 3
fi

# Open the browser
URL="http://localhost:3000?testMode=review&sessionId=$SESSION_ID"
echo -e "${GREEN}🌐 Opening browser at:${NC}"
echo "  $URL"
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open "$URL"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    xdg-open "$URL"
else
    echo "Please open manually: $URL"
fi

echo -e "${GREEN}✨ Done!${NC}"