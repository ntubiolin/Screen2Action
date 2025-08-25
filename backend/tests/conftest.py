"""Shared pytest fixtures for backend tests."""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path
import tempfile
import shutil
from typing import Generator, AsyncGenerator

from fastapi.testclient import TestClient
from fastapi import WebSocket

# Import app and services
from app.main import app, ConnectionManager
from app.services.recording_service import RecordingService
from app.services.screenshot_service import ScreenshotService
from app.services.llm_service import LLMService
from app.services.mcp_service import MCPService
from app.websocket_client import WebSocketClient


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def test_client():
    """Create a test client for FastAPI app."""
    return TestClient(app)


@pytest.fixture
def temp_dir():
    """Create a temporary directory for test files."""
    temp_path = tempfile.mkdtemp()
    yield Path(temp_path)
    shutil.rmtree(temp_path)


@pytest.fixture
def mock_websocket():
    """Create a mock WebSocket connection."""
    websocket = MagicMock(spec=WebSocket)
    websocket.accept = AsyncMock()
    websocket.send_json = AsyncMock()
    websocket.receive_json = AsyncMock()
    websocket.close = AsyncMock()
    return websocket


@pytest.fixture
def mock_websocket_client():
    """Create a mock WebSocketClient."""
    client = MagicMock(spec=WebSocketClient)
    client.connect = AsyncMock()
    client.disconnect = AsyncMock()
    client.send_message = AsyncMock()
    client.send_response = AsyncMock()
    client.is_connected = MagicMock(return_value=True)
    return client


@pytest.fixture
def connection_manager():
    """Create a ConnectionManager instance."""
    return ConnectionManager()


@pytest.fixture
def recording_service(mock_websocket_client, temp_dir):
    """Create a RecordingService instance with mocked dependencies."""
    service = RecordingService()
    service.set_websocket_client(mock_websocket_client)
    # Override output directory to use temp directory
    with patch.object(service, 'output_dir', temp_dir):
        yield service


@pytest.fixture
def screenshot_service(mock_websocket_client, temp_dir):
    """Create a ScreenshotService instance with mocked dependencies."""
    service = ScreenshotService()
    service.set_websocket_client(mock_websocket_client)
    # Override output directory to use temp directory
    with patch.object(service, 'output_dir', temp_dir):
        yield service


@pytest.fixture
def llm_service():
    """Create an LLMService instance with mocked API clients."""
    with patch('app.services.llm_service.OpenAI') as mock_openai, \
         patch('app.services.llm_service.Anthropic') as mock_anthropic:
        
        # Mock OpenAI client
        mock_openai_instance = MagicMock()
        mock_openai.return_value = mock_openai_instance
        
        # Mock Anthropic client
        mock_anthropic_instance = MagicMock()
        mock_anthropic.return_value = mock_anthropic_instance
        
        service = LLMService()
        service.openai_client = mock_openai_instance
        service.anthropic_client = mock_anthropic_instance
        
        yield service


@pytest.fixture
def mcp_service():
    """Create an MCPService instance with mocked dependencies."""
    with patch('app.services.mcp_service.MCPClient') as mock_mcp_client:
        mock_client_instance = MagicMock()
        mock_mcp_client.return_value = mock_client_instance
        
        service = MCPService()
        service.mcp_client = mock_client_instance
        
        yield service


@pytest.fixture
def sample_message_data():
    """Sample message data for testing."""
    return {
        "id": "test-123",
        "action": "test_action",
        "payload": {
            "key": "value",
            "nested": {
                "data": "test"
            }
        }
    }


@pytest.fixture
def sample_recording_config():
    """Sample recording configuration."""
    return {
        "session_id": "recording-123",
        "audio_enabled": True,
        "video_enabled": True,
        "screen_id": "screen-1",
        "microphone_id": "mic-1",
        "system_audio": True,
        "output_format": "mp4",
        "quality": "high"
    }


@pytest.fixture
def sample_screenshot_config():
    """Sample screenshot configuration."""
    return {
        "session_id": "screenshot-456",
        "capture_mode": "fullscreen",
        "include_cursor": True,
        "format": "png",
        "quality": 90
    }


@pytest.fixture
def sample_llm_config():
    """Sample LLM configuration."""
    return {
        "provider": "openai",
        "model": "gpt-4",
        "temperature": 0.7,
        "max_tokens": 1000,
        "system_prompt": "You are a helpful assistant."
    }


@pytest.fixture
async def mock_audio_devices():
    """Mock audio devices list."""
    return [
        {
            "id": "mic-1",
            "name": "Built-in Microphone",
            "type": "input",
            "is_default": True
        },
        {
            "id": "speaker-1",
            "name": "Built-in Speakers",
            "type": "output",
            "is_default": True
        }
    ]


@pytest.fixture
async def mock_screen_sources():
    """Mock screen sources list."""
    return [
        {
            "id": "screen-1",
            "name": "Main Display",
            "type": "screen",
            "thumbnail": "data:image/png;base64,..."
        },
        {
            "id": "window-1",
            "name": "Chrome",
            "type": "window",
            "thumbnail": "data:image/png;base64,..."
        }
    ]


@pytest.fixture
def mock_mcp_servers():
    """Mock MCP servers configuration."""
    return {
        "servers": [
            {
                "name": "test-server",
                "protocol": "stdio",
                "command": "python",
                "args": ["-m", "test_server"],
                "env": {"TEST_VAR": "value"}
            }
        ]
    }


@pytest.fixture
def mock_mcp_tools():
    """Mock MCP tools list."""
    return [
        {
            "name": "test_tool",
            "description": "A test tool",
            "parameters": {
                "type": "object",
                "properties": {
                    "input": {"type": "string"}
                },
                "required": ["input"]
            }
        }
    ]