#!/bin/bash
# Wrapper script to start the backend with the correct Python environment

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if virtual environment exists
if [ -d "$SCRIPT_DIR/.venv" ]; then
    PYTHON_CMD="$SCRIPT_DIR/.venv/bin/python"
elif [ -d "$SCRIPT_DIR/venv" ]; then
    PYTHON_CMD="$SCRIPT_DIR/venv/bin/python"
else
    # Fallback to system Python
    PYTHON_CMD="python3"
fi

# Start the backend
exec "$PYTHON_CMD" "$SCRIPT_DIR/run.py"