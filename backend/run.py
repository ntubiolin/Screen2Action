#!/usr/bin/env python3
"""
Screen2Action Backend Server
Run this script to start the FastAPI backend with WebSocket support
"""

import sys
import logging
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

import uvicorn
from app.main import app

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Run server
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8766,
        reload=True,
        log_level="info"
    )