#!/bin/bash

# E2E test runner script for Electron app
# Usage: ./e2e-test.sh [test-name]

echo "🚀 Starting E2E Test Runner"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if backend is running
if lsof -Pi :8765 -sTCP:LISTEN -t >/dev/null 2>/dev/null || lsof -Pi :8766 -sTCP:LISTEN -t >/dev/null 2>/dev/null; then
    echo -e "${GREEN}✅ Backend is running${NC}"
else
    echo -e "${YELLOW}⚠️  Backend not detected, tests will start it automatically${NC}"
fi

# Build the app first
echo -e "${YELLOW}Building Electron app...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful${NC}"

# Run the tests
if [ -z "$1" ]; then
    echo -e "${YELLOW}Running all E2E tests...${NC}"
    npx playwright test
else
    echo -e "${YELLOW}Running test: $1${NC}"
    npx playwright test -g "$1"
fi

# Check test results
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Tests passed successfully!${NC}"
else
    echo -e "${RED}❌ Tests failed${NC}"
    echo -e "${YELLOW}Check playwright-report/index.html for details${NC}"
    exit 1
fi