"""Unit tests for main FastAPI application."""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient


class TestMainApp:
    """Test suite for main FastAPI application."""

    @pytest.fixture
    def client(self):
        """Create test client for FastAPI app."""
        with patch('app.main.LLMService'):
            with patch('app.main.MCPService'):
                with patch('app.main.ScreenshotService'):
                    with patch('app.main.RecordingService'):
                        with patch('app.main.WebSocketClient'):
                            from app.main import app
                            return TestClient(app)

    def test_health_check(self, client):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}

    def test_cors_headers(self, client):
        """Test CORS headers are properly set."""
        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )
        assert "access-control-allow-origin" in response.headers

    @pytest.mark.asyncio
    async def test_websocket_endpoint(self):
        """Test WebSocket endpoint."""
        with patch('app.main.LLMService'):
            with patch('app.main.MCPService'):
                with patch('app.main.ScreenshotService'):
                    with patch('app.main.RecordingService'):
                        with patch('app.main.WebSocketClient'):
                            from app.main import app
                            from fastapi.testclient import TestClient
                            
                            client = TestClient(app)
                            with client.websocket_connect("/ws") as websocket:
                                # Send a test message
                                websocket.send_json({
                                    "type": "ping",
                                    "data": {}
                                })
                                
                                # Should receive response
                                data = websocket.receive_json()
                                assert data is not None

    def test_notes_enhance_endpoint(self, client):
        """Test notes enhancement endpoint."""
        with patch('app.main.llm_service.enhance_note', new=AsyncMock(return_value={"response": "Enhanced note"})):
            response = client.post(
                "/api/notes/enhance",
                json={
                    "noteContent": "Test note",
                    "prompt": "Enhance this"
                }
            )
            assert response.status_code == 200
            assert "response" in response.json()

    def test_screenshot_command_endpoint(self, client):
        """Test screenshot command endpoint."""
        with patch('app.main.llm_service.process_screenshot_command', new=AsyncMock(
            return_value={"intent": "annotate", "parameters": {}}
        )):
            response = client.post(
                "/api/screenshot/command",
                json={
                    "command": "Add arrow here",
                    "ocrText": "Sample text"
                }
            )
            assert response.status_code == 200
            assert response.json()["intent"] == "annotate"

    def test_mcp_tool_execute_endpoint(self, client):
        """Test MCP tool execution endpoint."""
        with patch('app.main.mcp_service.execute_tool', new=AsyncMock(
            return_value={"success": True, "result": "Tool executed"}
        )):
            response = client.post(
                "/api/mcp/tool/execute",
                json={
                    "tool_name": "test_tool",
                    "params": {"param1": "value1"}
                }
            )
            assert response.status_code == 200
            assert response.json()["success"] is True

    def test_mcp_tool_list_endpoint(self, client):
        """Test MCP tool list endpoint."""
        with patch('app.main.mcp_service.list_available_tools', return_value={
            "builtin": ["file_read", "file_write"],
            "mcp": {}
        }):
            response = client.get("/api/mcp/tools")
            assert response.status_code == 200
            assert "builtin" in response.json()

    def test_ai_general_endpoint(self, client):
        """Test AI general endpoint."""
        with patch('app.main.llm_service.process_general', new=AsyncMock(
            return_value={"response": "AI response"}
        )):
            response = client.post(
                "/api/ai/general",
                json={
                    "prompt": "Test prompt",
                    "context": {}
                }
            )
            assert response.status_code == 200
            assert "response" in response.json()

    def test_recording_start_endpoint(self, client):
        """Test recording start endpoint."""
        with patch('app.main.recording_service.start_recording', return_value="session-123"):
            response = client.post(
                "/api/recording/start",
                json={
                    "source_id": "screen1",
                    "audio_mic": True,
                    "audio_system": True
                }
            )
            assert response.status_code == 200
            assert response.json()["session_id"] == "session-123"

    def test_recording_stop_endpoint(self, client):
        """Test recording stop endpoint."""
        with patch('app.main.recording_service.stop_recording', new=AsyncMock(return_value=True)):
            response = client.post(
                "/api/recording/stop",
                json={"session_id": "session-123"}
            )
            assert response.status_code == 200
            assert response.json()["success"] is True

    def test_screenshot_capture_endpoint(self, client):
        """Test screenshot capture endpoint."""
        with patch('app.main.screenshot_service.capture_screenshot', new=AsyncMock(
            return_value="/path/to/screenshot.png"
        )):
            response = client.post("/api/screenshot/capture")
            assert response.status_code == 200
            assert "path" in response.json()

    def test_error_handling_404(self, client):
        """Test 404 error handling."""
        response = client.get("/nonexistent")
        assert response.status_code == 404

    def test_error_handling_invalid_json(self, client):
        """Test invalid JSON handling."""
        response = client.post(
            "/api/notes/enhance",
            data="invalid json",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 422

    def test_startup_event(self):
        """Test application startup event."""
        with patch('app.main.WebSocketClient') as mock_ws:
            with patch('app.main.LLMService'):
                with patch('app.main.MCPService'):
                    with patch('app.main.ScreenshotService'):
                        with patch('app.main.RecordingService'):
                            mock_instance = MagicMock()
                            mock_ws.return_value = mock_instance
                            
                            from app.main import startup_event
                            import asyncio
                            asyncio.run(startup_event())
                            
                            mock_instance.connect.assert_called_once()

    def test_shutdown_event(self):
        """Test application shutdown event."""
        with patch('app.main.websocket_client') as mock_client:
            mock_client.disconnect = AsyncMock()
            
            from app.main import shutdown_event
            import asyncio
            asyncio.run(shutdown_event())
            
            mock_client.disconnect.assert_called_once()