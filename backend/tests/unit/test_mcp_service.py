"""Unit tests for MCPService."""

import pytest
import json
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch, mock_open
try:
    from app.services.mcp_service import MCPService
except ImportError:
    # Handle import error for testing
    MCPService = None


class TestMCPService:
    """Test suite for MCPService."""

    @pytest.fixture
    def mcp_service(self):
        """Create MCPService instance."""
        if MCPService is None:
            pytest.skip("MCPService not available")
        with patch('app.services.mcp_service.MCPClient'):
            service = MCPService()
            service.mcp_client = MagicMock()
            return service

    def test_initialization(self):
        """Test MCPService initialization."""
        if MCPService is None:
            pytest.skip("MCPService not available")
        with patch('app.services.mcp_service.MCPClient') as mock_client:
            service = MCPService()
            
            assert isinstance(service.tools, dict)
            assert len(service.tools) > 0
            assert 'file_read' in service.tools
            assert 'file_write' in service.tools
            assert 'json_parse' in service.tools
            assert 'text_extract' in service.tools
            assert 'execute_command' in service.tools
            mock_client.assert_called_once()

    def test_register_tool(self, mcp_service):
        """Test registering a new tool."""
        def custom_tool(params):
            return "custom result"
        
        mcp_service.register_tool("custom_tool", custom_tool)
        
        assert "custom_tool" in mcp_service.tools
        assert mcp_service.tools["custom_tool"] == custom_tool

    @pytest.mark.asyncio
    async def test_execute_tool_success(self, mcp_service):
        """Test executing a registered tool."""
        async def async_tool(params):
            return {"result": "success", "data": params.get("input")}
        
        mcp_service.register_tool("async_tool", async_tool)
        
        result = await mcp_service.execute_tool("async_tool", {"input": "test"})
        
        assert result["result"] == "success"
        assert result["data"] == "test"

    @pytest.mark.asyncio
    async def test_execute_tool_sync(self, mcp_service):
        """Test executing a synchronous tool."""
        def sync_tool(params):
            return {"result": "sync", "data": params.get("value")}
        
        mcp_service.register_tool("sync_tool", sync_tool)
        
        result = await mcp_service.execute_tool("sync_tool", {"value": "test"})
        
        assert result["result"] == "sync"
        assert result["data"] == "test"

    @pytest.mark.asyncio
    async def test_execute_unknown_tool(self, mcp_service):
        """Test executing an unknown tool raises error."""
        with pytest.raises(ValueError, match="Unknown MCP tool: unknown_tool"):
            await mcp_service.execute_tool("unknown_tool", {})

    @pytest.mark.asyncio
    async def test_execute_tool_with_exception(self, mcp_service):
        """Test tool execution error handling."""
        def failing_tool(params):
            raise Exception("Tool failed")
        
        mcp_service.register_tool("failing_tool", failing_tool)
        
        with pytest.raises(Exception, match="Tool failed"):
            await mcp_service.execute_tool("failing_tool", {})

    @pytest.mark.asyncio
    async def test_file_read_tool(self, mcp_service):
        """Test file_read tool."""
        mock_data = "file contents"
        
        with patch("builtins.open", mock_open(read_data=mock_data)):
            result = await mcp_service.execute_tool(
                "file_read", 
                {"path": "/test/file.txt"}
            )
            
            assert result["success"] is True
            assert result["content"] == mock_data

    @pytest.mark.asyncio
    async def test_file_read_tool_error(self, mcp_service):
        """Test file_read tool error handling."""
        with patch("builtins.open", side_effect=FileNotFoundError("File not found")):
            result = await mcp_service.execute_tool(
                "file_read",
                {"path": "/nonexistent.txt"}
            )
            
            assert result["success"] is False
            assert "File not found" in result["error"]

    @pytest.mark.asyncio
    async def test_file_write_tool(self, mcp_service):
        """Test file_write tool."""
        with patch("builtins.open", mock_open()) as mock_file:
            result = await mcp_service.execute_tool(
                "file_write",
                {"path": "/test/output.txt", "content": "test content"}
            )
            
            assert result["success"] is True
            mock_file.assert_called_with("/test/output.txt", "w")
            mock_file().write.assert_called_with("test content")

    @pytest.mark.asyncio
    async def test_file_write_tool_error(self, mcp_service):
        """Test file_write tool error handling."""
        with patch("builtins.open", side_effect=PermissionError("Permission denied")):
            result = await mcp_service.execute_tool(
                "file_write",
                {"path": "/protected/file.txt", "content": "test"}
            )
            
            assert result["success"] is False
            assert "Permission denied" in result["error"]

    @pytest.mark.asyncio
    async def test_json_parse_tool(self, mcp_service):
        """Test json_parse tool."""
        json_string = '{"key": "value", "number": 42}'
        
        result = await mcp_service.execute_tool(
            "json_parse",
            {"text": json_string}
        )
        
        assert result["success"] is True
        assert result["data"]["key"] == "value"
        assert result["data"]["number"] == 42

    @pytest.mark.asyncio
    async def test_json_parse_tool_invalid(self, mcp_service):
        """Test json_parse tool with invalid JSON."""
        invalid_json = '{"key": invalid}'
        
        result = await mcp_service.execute_tool(
            "json_parse",
            {"text": invalid_json}
        )
        
        assert result["success"] is False
        assert "error" in result

    @pytest.mark.asyncio
    async def test_text_extract_tool(self, mcp_service):
        """Test text_extract tool."""
        text = "The quick brown fox jumps over the lazy dog"
        
        result = await mcp_service.execute_tool(
            "text_extract",
            {"text": text, "pattern": r"quick (\w+) fox"}
        )
        
        assert result["success"] is True
        assert "brown" in result["matches"]

    @pytest.mark.asyncio
    async def test_execute_command_tool(self, mcp_service):
        """Test execute_command tool."""
        with patch("asyncio.create_subprocess_shell") as mock_subprocess:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b"output", b"")
            mock_process.returncode = 0
            mock_subprocess.return_value = mock_process
            
            result = await mcp_service.execute_tool(
                "execute_command",
                {"command": "echo test"}
            )
            
            assert result["success"] is True
            assert result["output"] == "output"
            assert result["returncode"] == 0

    @pytest.mark.asyncio
    async def test_execute_command_tool_error(self, mcp_service):
        """Test execute_command tool with error."""
        with patch("asyncio.create_subprocess_shell") as mock_subprocess:
            mock_process = AsyncMock()
            mock_process.communicate.return_value = (b"", b"error output")
            mock_process.returncode = 1
            mock_subprocess.return_value = mock_process
            
            result = await mcp_service.execute_tool(
                "execute_command",
                {"command": "false"}
            )
            
            assert result["success"] is False
            assert result["error"] == "error output"
            assert result["returncode"] == 1

    @pytest.mark.asyncio
    async def test_initialize_mcp_servers(self, mcp_service):
        """Test initializing MCP servers."""
        mock_config = {
            "server1": {
                "type": "stdio",
                "command": ["node", "server.js"],
                "args": []
            }
        }
        
        with patch.object(mcp_service.mcp_client, 'load_config') as mock_load:
            with patch.object(mcp_service.mcp_client, 'initialize_servers') as mock_init:
                mock_load.return_value = mock_config
                mock_init.return_value = {"server1": "initialized"}
                
                result = await mcp_service.initialize_mcp_servers("/config/path")
                
                mock_load.assert_called_once_with("/config/path")
                mock_init.assert_called_once()
                assert result == {"server1": "initialized"}

    @pytest.mark.asyncio
    async def test_call_mcp_tool(self, mcp_service):
        """Test calling an MCP tool."""
        mock_result = {"result": "mcp_response"}
        
        with patch.object(mcp_service.mcp_client, 'call_tool', new=AsyncMock(return_value=mock_result)):
            result = await mcp_service.call_mcp_tool(
                "server1",
                "tool_name",
                {"param": "value"}
            )
            
            assert result == mock_result
            mcp_service.mcp_client.call_tool.assert_called_once_with(
                "server1",
                "tool_name",
                {"param": "value"}
            )

    @pytest.mark.asyncio
    async def test_list_available_tools(self, mcp_service):
        """Test listing available tools."""
        mcp_service.register_tool("custom1", lambda x: x)
        mcp_service.register_tool("custom2", lambda x: x)
        
        mock_mcp_tools = {
            "server1": ["tool1", "tool2"],
            "server2": ["tool3"]
        }
        
        with patch.object(mcp_service.mcp_client, 'list_tools', return_value=mock_mcp_tools):
            tools = mcp_service.list_available_tools()
            
            assert "builtin" in tools
            assert "file_read" in tools["builtin"]
            assert "custom1" in tools["builtin"]
            assert "custom2" in tools["builtin"]
            assert tools["mcp"] == mock_mcp_tools

    @pytest.mark.asyncio
    async def test_file_list_tool(self, mcp_service):
        """Test file_list tool."""
        import os
        
        with patch('os.listdir', return_value=['file1.txt', 'file2.py', 'dir1']):
            with patch('os.path.isfile', side_effect=[True, True, False]):
                with patch('os.path.isdir', side_effect=[False, False, True]):
                    result = await mcp_service.execute_tool(
                        "file_list",
                        {"path": "/test/dir"}
                    )
                    
                    assert result["success"] is True
                    assert len(result["files"]) == 2
                    assert len(result["directories"]) == 1
                    assert "file1.txt" in result["files"]
                    assert "dir1" in result["directories"]

    @pytest.mark.asyncio
    async def test_cleanup(self, mcp_service):
        """Test cleanup method."""
        with patch.object(mcp_service.mcp_client, 'cleanup', new=AsyncMock()):
            await mcp_service.cleanup()
            mcp_service.mcp_client.cleanup.assert_called_once()