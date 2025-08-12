#!/bin/bash

echo "Starting Screen2Action..."

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo "Error: uv is not installed. Please install it first:"
    echo "curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# Check if Python environment exists and sync
if [ ! -d "backend/.venv" ]; then
    echo "Creating Python virtual environment with uv..."
    cd backend
    uv venv
    uv sync
    cd ..
else
    echo "Python virtual environment found. Syncing dependencies..."
    cd backend
    uv sync
    cd ..
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi

# Start backend in background
echo "Starting Python backend..."
cd backend
source .venv/bin/activate
python run.py &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start frontend
echo "Starting Electron frontend..."
npm run dev

# When frontend exits, kill backend
kill $BACKEND_PID