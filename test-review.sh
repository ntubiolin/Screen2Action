#!/bin/bash

# Quick test script for Review Page
# Usage: ./test-review.sh [sessionId]

SESSION_ID=${1:-"cc8fb903-f5a0-4c88-877b-d4ef05d408dc"}

echo "🚀 Starting Review Page test mode..."
echo "📝 Session ID: $SESSION_ID"
echo ""
echo "Opening browser at: http://localhost:3000?testMode=review&sessionId=$SESSION_ID"
echo ""

# Open the URL in the default browser
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open "http://localhost:3000?testMode=review&sessionId=$SESSION_ID"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    xdg-open "http://localhost:3000?testMode=review&sessionId=$SESSION_ID"
else
    echo "Please open: http://localhost:3000?testMode=review&sessionId=$SESSION_ID"
fi

# Start the dev server
npm run dev:renderer