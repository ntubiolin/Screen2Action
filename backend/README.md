# Screen2Action Backend

Python backend service for Screen2Action - AI-powered screen recording and screenshot tool.

## Features

- WebSocket server for real-time communication with Electron frontend
- Screen recording and screenshot capture
- Audio recording (microphone and system audio)
- OCR text extraction from images
- LLM integration (OpenAI/Anthropic)
- MCP (Model Context Protocol) tool support

## Installation

Using `uv` package manager:

```bash
# Install uv if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create virtual environment
uv venv

# Sync dependencies
uv sync
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:
- `OPENAI_API_KEY` - Your OpenAI API key
- `LLM_MODEL` - Model to use (default: gpt-4)

## Running the Server

```bash
# Activate virtual environment
source .venv/bin/activate

# Run the server
python run.py
```

The server will start on `http://localhost:8765`

## API Documentation

When the server is running, visit:
- API docs: `http://localhost:8765/docs`
- Health check: `http://localhost:8765/health`

## Development

```bash
# Run with auto-reload
uvicorn app.main:app --reload --port 8765

# Format code
uv run black app/

# Lint code
uv run ruff check app/

# Type checking
uv run mypy app/
```