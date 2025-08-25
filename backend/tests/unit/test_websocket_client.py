"""Unit tests for WebSocketClient."""

import pytest
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch, create_autospec
import websockets
from app.websocket_client import WebSocketClient


class TestWebSocketClient:
    """Test suite for WebSocketClient."""

    @pytest.fixture
    def websocket_client(self):
        """Create a WebSocketClient instance."""
        return WebSocketClient("ws://localhost:8765")

    @pytest.mark.asyncio
    async def test_connect_success(self, websocket_client):
        """Test successful WebSocket connection."""
        mock_websocket = create_autospec(websockets.WebSocketClientProtocol, instance=True)
        
        with patch('websockets.connect', return_value=mock_websocket) as mock_connect:
            result = await websocket_client.connect()
            
            assert result is True
            mock_connect.assert_called_once_with("ws://localhost:8765")
            assert websocket_client.websocket == mock_websocket
            assert websocket_client.running is True

    @pytest.mark.asyncio
    async def test_connect_failure(self, websocket_client):
        """Test WebSocket connection failure."""
        with patch('websockets.connect', side_effect=Exception("Connection failed")):
            result = await websocket_client.connect()
            
            assert result is False
            assert websocket_client.websocket is None
            assert websocket_client.running is False

    @pytest.mark.asyncio
    async def test_disconnect(self, websocket_client):
        """Test WebSocket disconnection."""
        mock_websocket = AsyncMock()
        websocket_client.websocket = mock_websocket
        websocket_client.running = True
        
        await websocket_client.disconnect()
        
        mock_websocket.close.assert_called_once()
        assert websocket_client.websocket is None
        assert websocket_client.running is False

    @pytest.mark.asyncio
    async def test_send_message_when_connected(self, websocket_client):
        """Test sending message when connected."""
        mock_websocket = AsyncMock()
        websocket_client.websocket = mock_websocket
        
        test_data = {"action": "test", "payload": {"key": "value"}}
        await websocket_client.send_message(test_data)
        
        mock_websocket.send.assert_called_once_with(json.dumps(test_data))

    @pytest.mark.asyncio
    async def test_send_message_when_disconnected(self, websocket_client):
        """Test sending message when disconnected."""
        websocket_client.websocket = None
        
        test_data = {"action": "test"}
        # Should not raise exception, just log error
        await websocket_client.send_message(test_data)

    @pytest.mark.asyncio
    async def test_send_response(self, websocket_client):
        """Test sending response message."""
        mock_websocket = AsyncMock()
        websocket_client.websocket = mock_websocket
        
        message_id = "msg-123"
        response_payload = {"result": "success"}
        
        with patch('asyncio.get_event_loop') as mock_loop:
            mock_loop.return_value.time.return_value = 12345.0
            await websocket_client.send_response(message_id, response_payload)
        
        # Check that send was called
        assert mock_websocket.send.called
        sent_data = json.loads(mock_websocket.send.call_args[0][0])
        assert sent_data["type"] == "response"
        assert sent_data["id"] == message_id
        assert sent_data["payload"] == response_payload
        assert "timestamp" in sent_data

    @pytest.mark.asyncio
    async def test_send_event(self, websocket_client):
        """Test sending event message."""
        mock_websocket = AsyncMock()
        websocket_client.websocket = mock_websocket
        
        action = "test_event"
        event_payload = {"data": "test"}
        
        with patch('asyncio.get_event_loop') as mock_loop:
            mock_loop.return_value.time.return_value = 12345.0
            await websocket_client.send_event(action, event_payload)
        
        # Check that send was called
        assert mock_websocket.send.called
        sent_data = json.loads(mock_websocket.send.call_args[0][0])
        assert sent_data["type"] == "event"
        assert sent_data["action"] == action
        assert sent_data["payload"] == event_payload
        assert "timestamp" in sent_data

    @pytest.mark.asyncio
    async def test_listen_with_valid_messages(self, websocket_client):
        """Test listening for valid messages."""
        mock_websocket = AsyncMock()
        test_messages = [
            json.dumps({"action": "test1"}),
            json.dumps({"action": "test2"})
        ]
        mock_websocket.__aiter__.return_value = test_messages
        
        websocket_client.websocket = mock_websocket
        
        received_messages = []
        async def message_handler(data):
            received_messages.append(data)
        
        websocket_client.set_message_handler(message_handler)
        
        await websocket_client.listen()
        
        assert len(received_messages) == 2
        assert received_messages[0]["action"] == "test1"
        assert received_messages[1]["action"] == "test2"

    @pytest.mark.asyncio
    async def test_listen_with_invalid_json(self, websocket_client):
        """Test listening with invalid JSON messages."""
        mock_websocket = AsyncMock()
        test_messages = [
            "invalid json {",
            json.dumps({"action": "valid"})
        ]
        mock_websocket.__aiter__.return_value = test_messages
        
        websocket_client.websocket = mock_websocket
        
        received_messages = []
        async def message_handler(data):
            received_messages.append(data)
        
        websocket_client.set_message_handler(message_handler)
        
        await websocket_client.listen()
        
        # Only valid message should be processed
        assert len(received_messages) == 1
        assert received_messages[0]["action"] == "valid"

    @pytest.mark.asyncio
    async def test_listen_connection_closed(self, websocket_client):
        """Test handling connection closed during listen."""
        mock_websocket = AsyncMock()
        mock_websocket.__aiter__.side_effect = websockets.exceptions.ConnectionClosed(None, None)
        
        websocket_client.websocket = mock_websocket
        websocket_client.running = True
        
        await websocket_client.listen()
        
        assert websocket_client.running is False

    @pytest.mark.asyncio
    async def test_listen_without_connection(self, websocket_client):
        """Test listening without an active connection."""
        websocket_client.websocket = None
        
        # Should not raise exception, just log error
        await websocket_client.listen()

    @pytest.mark.asyncio
    async def test_set_message_handler(self, websocket_client):
        """Test setting message handler."""
        async def custom_handler(data):
            pass
        
        websocket_client.set_message_handler(custom_handler)
        assert websocket_client.message_handler == custom_handler

    @pytest.mark.asyncio
    async def test_run_with_successful_connection(self, websocket_client):
        """Test run method with successful connection."""
        mock_websocket = create_autospec(websockets.WebSocketClientProtocol, instance=True)
        
        with patch.object(websocket_client, 'connect', return_value=True) as mock_connect:
            with patch.object(websocket_client, 'listen') as mock_listen:
                with patch.object(websocket_client, 'disconnect') as mock_disconnect:
                    # Simulate stopping after one iteration
                    mock_listen.side_effect = lambda: setattr(websocket_client, 'running', False)
                    
                    await websocket_client.run()
                    
                    mock_connect.assert_called()
                    mock_listen.assert_called()
                    mock_disconnect.assert_called()

    @pytest.mark.asyncio
    async def test_run_with_failed_connection(self, websocket_client):
        """Test run method with failed connection and reconnect."""
        with patch.object(websocket_client, 'connect', return_value=False) as mock_connect:
            with patch.object(websocket_client, 'disconnect') as mock_disconnect:
                with patch('asyncio.sleep') as mock_sleep:
                    # Stop after first reconnect attempt
                    mock_sleep.side_effect = [None, KeyboardInterrupt()]
                    
                    try:
                        await websocket_client.run()
                    except KeyboardInterrupt:
                        pass
                    
                    assert mock_connect.call_count >= 1
                    mock_sleep.assert_called_with(5)

    @pytest.mark.asyncio
    async def test_message_handler_error(self, websocket_client):
        """Test error handling in message handler."""
        mock_websocket = AsyncMock()
        test_messages = [json.dumps({"action": "test"})]
        mock_websocket.__aiter__.return_value = test_messages
        
        websocket_client.websocket = mock_websocket
        
        async def failing_handler(data):
            raise Exception("Handler error")
        
        websocket_client.set_message_handler(failing_handler)
        
        # Should not raise exception, just log error
        await websocket_client.listen()