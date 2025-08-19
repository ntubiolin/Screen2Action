#!/bin/bash

# Complete test script that starts both backend and frontend for Review Page testing
# Usage: ./test-review-full.sh [sessionId]

SESSION_ID=${1:-"cc8fb903-f5a0-4c88-877b-d4ef05d408dc"}

echo "🚀 Starting Review Page Full Test Mode"
echo "📝 Session ID: $SESSION_ID"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}🛑 Stopping services...${NC}"
    
    # Only kill backend if we started it
    if [ ! -z "$BACKEND_PID" ] && [ "$BACKEND_ALREADY_RUNNING" != "true" ]; then
        echo "Stopping backend..."
        kill $BACKEND_PID 2>/dev/null
        wait $BACKEND_PID 2>/dev/null
    fi
    
    # Only kill frontend if we started it
    if [ ! -z "$FRONTEND_PID" ] && [ "$FRONTEND_ALREADY_RUNNING" != "true" ]; then
        echo "Stopping frontend..."
        kill $FRONTEND_PID 2>/dev/null
        wait $FRONTEND_PID 2>/dev/null
    fi
    
    echo -e "${GREEN}✨ Cleanup complete${NC}"
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGINT SIGTERM

# Check if backend is already running
if lsof -Pi :8765 -sTCP:LISTEN -t >/dev/null 2>/dev/null || nc -z localhost 8765 2>/dev/null ; then
    echo -e "${GREEN}✅ Backend already running on port 8765${NC}"
    BACKEND_ALREADY_RUNNING=true
else
    echo -e "${YELLOW}Starting Python backend...${NC}"
    cd backend
    if [ -f .venv/bin/activate ]; then
        source .venv/bin/activate
    elif [ -f .venv/Scripts/activate ]; then
        source .venv/Scripts/activate
    else
        echo -e "${RED}❌ Virtual environment not found. Please run 'uv venv' in backend directory${NC}"
        exit 1
    fi
    
    # Start backend in background and capture output
    python run.py > /tmp/backend.log 2>&1 &
    BACKEND_PID=$!
    cd ..
    
    # Wait for backend to start with timeout
    echo "Waiting for backend to start..."
    for i in {1..10}; do
        if lsof -Pi :8765 -sTCP:LISTEN -t >/dev/null 2>/dev/null || nc -z localhost 8765 2>/dev/null ; then
            echo -e "${GREEN}✅ Backend started successfully${NC}"
            break
        fi
        if [ $i -eq 10 ]; then
            echo -e "${RED}❌ Backend failed to start. Check /tmp/backend.log for errors${NC}"
            cat /tmp/backend.log
            kill $BACKEND_PID 2>/dev/null
            exit 1
        fi
        sleep 1
    done
fi

# Check if frontend dev server is already running
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>/dev/null || nc -z localhost 3000 2>/dev/null ; then
    echo -e "${GREEN}✅ Frontend already running on port 3000${NC}"
    FRONTEND_ALREADY_RUNNING=true
else
    echo -e "${YELLOW}Starting frontend dev server...${NC}"
    npm run dev:renderer > /tmp/frontend.log 2>&1 &
    FRONTEND_PID=$!
    
    # Wait for frontend to start with timeout
    echo "Waiting for frontend to start..."
    for i in {1..15}; do
        if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>/dev/null || nc -z localhost 3000 2>/dev/null ; then
            echo -e "${GREEN}✅ Frontend started successfully${NC}"
            break
        fi
        if [ $i -eq 15 ]; then
            echo -e "${RED}❌ Frontend failed to start. Check /tmp/frontend.log for errors${NC}"
            tail -20 /tmp/frontend.log
            kill $FRONTEND_PID 2>/dev/null
            exit 1
        fi
        sleep 1
    done
fi

# Open the browser
URL="http://localhost:3000?testMode=review&sessionId=$SESSION_ID"
echo -e "${GREEN}🌐 Opening browser at: $URL${NC}"

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open "$URL"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    xdg-open "$URL"
else
    echo "Please open manually: $URL"
fi

echo ""
echo -e "${GREEN}✨ Test environment is ready!${NC}"
echo "Press Ctrl+C to stop all services"
echo ""

# Keep script running
wait