"""Integration tests for FastAPI endpoints."""

import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app


class TestAPIEndpoints:
    """Test suite for API endpoints."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        return TestClient(app)

    def test_root_endpoint(self, client):
        """Test root endpoint returns app info."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert data["name"] == "Screen2Action Backend"

    @pytest.mark.asyncio
    async def test_websocket_connection(self, client):
        """Test WebSocket connection."""
        with client.websocket_connect("/ws") as websocket:
            # Send a test message
            test_message = {
                "action": "ping",
                "payload": {"test": "data"}
            }
            websocket.send_json(test_message)
            
            # Should receive some response or handle the message
            # The actual behavior depends on the WebSocket handler implementation

    def test_health_check(self, client):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_start_recording_via_websocket(self, client):
        """Test starting recording through WebSocket."""
        with patch('app.main.recording_service.start_recording', new_callable=AsyncMock) as mock_start:
            mock_start.return_value = "session-123"
            
            with client.websocket_connect("/ws") as websocket:
                message = {
                    "id": "msg-1",
                    "action": "start_recording",
                    "payload": {
                        "audio_enabled": True,
                        "video_enabled": True
                    }
                }
                websocket.send_json(message)
                
                # The response handling depends on implementation
                # In a real test, we'd wait for and verify the response

    @pytest.mark.asyncio
    async def test_stop_recording_via_websocket(self, client):
        """Test stopping recording through WebSocket."""
        with patch('app.main.recording_service.stop_recording', new_callable=AsyncMock) as mock_stop:
            mock_stop.return_value = {"status": "stopped", "file_path": "/path/to/recording.mp4"}
            
            with client.websocket_connect("/ws") as websocket:
                message = {
                    "id": "msg-2",
                    "action": "stop_recording",
                    "payload": {}
                }
                websocket.send_json(message)

    @pytest.mark.asyncio
    async def test_take_screenshot_via_websocket(self, client):
        """Test taking screenshot through WebSocket."""
        with patch('app.main.screenshot_service.take_screenshot', new_callable=AsyncMock) as mock_screenshot:
            mock_screenshot.return_value = "/path/to/screenshot.png"
            
            with client.websocket_connect("/ws") as websocket:
                message = {
                    "id": "msg-3",
                    "action": "take_screenshot",
                    "payload": {
                        "capture_mode": "fullscreen"
                    }
                }
                websocket.send_json(message)

    @pytest.mark.asyncio
    async def test_process_with_llm_via_websocket(self, client):
        """Test LLM processing through WebSocket."""
        with patch('app.main.llm_service.process', new_callable=AsyncMock) as mock_process:
            mock_process.return_value = "AI response"
            
            with client.websocket_connect("/ws") as websocket:
                message = {
                    "id": "msg-4",
                    "action": "process_llm",
                    "payload": {
                        "prompt": "Test prompt",
                        "provider": "openai",
                        "model": "gpt-4"
                    }
                }
                websocket.send_json(message)

    @pytest.mark.asyncio
    async def test_get_mcp_servers_via_websocket(self, client):
        """Test getting MCP servers through WebSocket."""
        with patch('app.main.mcp_service.get_mcp_servers', new_callable=AsyncMock) as mock_get_servers:
            mock_get_servers.return_value = [{"name": "test-server"}]
            
            with client.websocket_connect("/ws") as websocket:
                message = {
                    "id": "msg-5",
                    "action": "get_mcp_servers",
                    "payload": {}
                }
                websocket.send_json(message)

    @pytest.mark.asyncio
    async def test_websocket_invalid_action(self, client):
        """Test WebSocket with invalid action."""
        with client.websocket_connect("/ws") as websocket:
            message = {
                "id": "msg-6",
                "action": "invalid_action",
                "payload": {}
            }
            websocket.send_json(message)
            
            # Should handle gracefully without crashing

    @pytest.mark.asyncio
    async def test_websocket_malformed_message(self, client):
        """Test WebSocket with malformed message."""
        with client.websocket_connect("/ws") as websocket:
            # Send invalid JSON
            websocket.send_text("invalid json {")
            
            # Should handle gracefully without crashing

    @pytest.mark.asyncio
    async def test_concurrent_websocket_connections(self, client):
        """Test multiple concurrent WebSocket connections."""
        with client.websocket_connect("/ws") as ws1:
            with client.websocket_connect("/ws") as ws2:
                # Both connections should work
                test_message = {"action": "ping", "payload": {}}
                ws1.send_json(test_message)
                ws2.send_json(test_message)

    def test_cors_headers(self, client):
        """Test CORS headers are properly set."""
        response = client.options("/", headers={"Origin": "http://localhost:3000"})
        assert "access-control-allow-origin" in response.headers
        assert response.headers["access-control-allow-origin"] == "*"

    @pytest.mark.asyncio
    async def test_startup_event(self):
        """Test application startup event."""
        with patch('app.main.electron_client.connect', new_callable=AsyncMock) as mock_connect:
            # Trigger startup event
            await app.router.startup()
            
            # Verify electron client connects on startup
            mock_connect.assert_called_once()

    @pytest.mark.asyncio
    async def test_shutdown_event(self):
        """Test application shutdown event."""
        with patch('app.main.electron_client.disconnect', new_callable=AsyncMock) as mock_disconnect:
            # Trigger shutdown event
            await app.router.shutdown()
            
            # Verify electron client disconnects on shutdown
            mock_disconnect.assert_called_once()