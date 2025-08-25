"""Unit tests for ConnectionManager."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.main import ConnectionManager


class TestConnectionManager:
    """Test suite for ConnectionManager."""

    @pytest.mark.asyncio
    async def test_connect(self, connection_manager, mock_websocket):
        """Test client connection."""
        await connection_manager.connect(mock_websocket)
        
        mock_websocket.accept.assert_called_once()
        assert mock_websocket in connection_manager.active_connections
        assert len(connection_manager.active_connections) == 1

    @pytest.mark.asyncio
    async def test_disconnect(self, connection_manager, mock_websocket):
        """Test client disconnection."""
        # First connect
        await connection_manager.connect(mock_websocket)
        assert len(connection_manager.active_connections) == 1
        
        # Then disconnect
        connection_manager.disconnect(mock_websocket)
        assert mock_websocket not in connection_manager.active_connections
        assert len(connection_manager.active_connections) == 0

    @pytest.mark.asyncio
    async def test_send_message(self, connection_manager, mock_websocket):
        """Test sending message to specific client."""
        message = {"type": "test", "data": "hello"}
        
        await connection_manager.send_message(mock_websocket, message)
        
        mock_websocket.send_json.assert_called_once_with(message)

    @pytest.mark.asyncio
    async def test_broadcast(self, connection_manager):
        """Test broadcasting message to all clients."""
        # Create multiple mock connections
        mock_ws1 = MagicMock()
        mock_ws1.send_json = AsyncMock()
        mock_ws2 = MagicMock()
        mock_ws2.send_json = AsyncMock()
        mock_ws3 = MagicMock()
        mock_ws3.send_json = AsyncMock()
        
        # Add connections
        connection_manager.active_connections = [mock_ws1, mock_ws2, mock_ws3]
        
        # Broadcast message
        message = {"type": "broadcast", "data": "hello all"}
        await connection_manager.broadcast(message)
        
        # Verify all connections received the message
        mock_ws1.send_json.assert_called_once_with(message)
        mock_ws2.send_json.assert_called_once_with(message)
        mock_ws3.send_json.assert_called_once_with(message)

    @pytest.mark.asyncio
    async def test_multiple_connections(self, connection_manager):
        """Test managing multiple connections."""
        mock_ws1 = MagicMock()
        mock_ws1.accept = AsyncMock()
        mock_ws2 = MagicMock()
        mock_ws2.accept = AsyncMock()
        mock_ws3 = MagicMock()
        mock_ws3.accept = AsyncMock()
        
        # Connect multiple clients
        await connection_manager.connect(mock_ws1)
        await connection_manager.connect(mock_ws2)
        await connection_manager.connect(mock_ws3)
        
        assert len(connection_manager.active_connections) == 3
        
        # Disconnect one
        connection_manager.disconnect(mock_ws2)
        assert len(connection_manager.active_connections) == 2
        assert mock_ws1 in connection_manager.active_connections
        assert mock_ws3 in connection_manager.active_connections
        assert mock_ws2 not in connection_manager.active_connections

    @pytest.mark.asyncio
    async def test_broadcast_empty_connections(self, connection_manager):
        """Test broadcasting when no connections exist."""
        message = {"type": "test"}
        
        # Should not raise exception
        await connection_manager.broadcast(message)
        
        assert len(connection_manager.active_connections) == 0

    @pytest.mark.asyncio
    async def test_disconnect_non_existent(self, connection_manager):
        """Test disconnecting a non-existent connection."""
        mock_ws = MagicMock()
        
        # Should raise ValueError when trying to remove non-existent connection
        with pytest.raises(ValueError):
            connection_manager.disconnect(mock_ws)