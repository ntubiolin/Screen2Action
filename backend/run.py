#!/usr/bin/env python3
"""
Screen2Action Backend Server
Run this script to start the FastAPI backend with WebSocket support
"""

import sys
import logging
from pathlib import Path
import os
from datetime import datetime

# Ensure project root on path (backend dir)
sys.path.insert(0, str(Path(__file__).parent))


def _resolve_logs_dir() -> Path:
    # 1) Environment override
    env_dir = os.environ.get('S2A_LOGS_DIR', '').strip()
    if env_dir:
        p = Path(os.path.expanduser(env_dir)).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p
    
    # 2) macOS standard used by the app (lower-case bundle id path)
    if sys.platform == 'darwin':
        p = Path.home() / 'Library' / 'Application Support' / 'screen2action' / 'logs'
        p.mkdir(parents=True, exist_ok=True)
        return p
    
    # 3) Fallback: local logs folder
    p = Path.cwd() / 'logs'
    p.mkdir(parents=True, exist_ok=True)
    return p


def setup_logging():
    """Set up logging configuration for backend server"""
    # Create logs directory
    log_dir = _resolve_logs_dir()
    
    # Create log file with timestamp
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    log_file = log_dir / f"backend-{timestamp}.log"
    
    # Configure logging to both file and console
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Log startup information
    logger = logging.getLogger(__name__)
    logger.info("Backend launcher starting...")
    logger.info(f"Python version: {sys.version}")
    logger.info(f"Log file: {log_file}")
    logger.info(f"Working directory: {Path.cwd()}")
    
    return logger


if __name__ == "__main__":
    # Set up logging first so we always capture errors
    logger = setup_logging()

    try:
        import uvicorn  # type: ignore
    except Exception as e:
        logger.error("Failed to import uvicorn. Please install backend deps (e.g., 'uv sync' or 'pip install -r requirements.txt').", exc_info=True)
        sys.exit(1)

    try:
        from app.main import app  # delayed import so logging is ready
    except Exception as e:
        logger.error("Failed to import FastAPI app. Ensure PYTHONPATH and dependencies are correct.", exc_info=True)
        sys.exit(1)
    
    try:
        # Run server
        logger.info("Starting FastAPI server on port 8766")
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=8766,
            reload=False,  # Disable reload in production
            log_level="info",
            access_log=True
        )
    except Exception as e:
        logger.error(f"Failed to start server: {e}", exc_info=True)
        sys.exit(1)