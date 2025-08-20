import logging
from typing import Dict, Any, Callable, Optional, List
import json
import asyncio
from .mcp_client import MCPClient, MCPServerConfig

logger = logging.getLogger(__name__)

class MCPService:
    """Model Context Protocol (MCP) Tool Service with enhanced MCP client integration"""
    
    def __init__(self):
        self.tools: Dict[str, Callable] = {}
        self.mcp_client = MCPClient()
        self._register_builtin_tools()
    
    def _register_builtin_tools(self):
        """Register built-in MCP tools"""
        # File operations
        self.register_tool("file_read", self._file_read)
        self.register_tool("file_write", self._file_write)
        self.register_tool("file_list", self._file_list)
        
        # Data processing
        self.register_tool("json_parse", self._json_parse)
        self.register_tool("text_extract", self._text_extract)
        
        # System operations
        self.register_tool("execute_command", self._execute_command)
        
        logger.info(f"Registered {len(self.tools)} built-in MCP tools")
    
    def register_tool(self, name: str, handler: Callable):
        """Register a new MCP tool"""
        self.tools[name] = handler
        logger.debug(f"Registered MCP tool: {name}")
    
    async def execute_tool(self, tool_name: str, params: Dict[str, Any]) -> Any:
        """Execute an MCP tool"""
        if tool_name not in self.tools:
            raise ValueError(f"Unknown MCP tool: {tool_name}")
        
        try:
            handler = self.tools[tool_name]
            
            # If handler is async, await it
            import asyncio
            if asyncio.iscoroutinefunction(handler):
                result = await handler(params)
            else:
                result = handler(params)
            
            logger.info(f"Executed MCP tool: {tool_name}")
            return result
            
        except Exception as e:
            logger.error(f"Failed to execute MCP tool {tool_name}: {e}")
            raise
    
    def list_tools(self) -> Dict[str, str]:
        """List available MCP tools"""
        return {
            name: handler.__doc__ or "No description"
            for name, handler in self.tools.items()
        }
    
    def prepare_session(self, session_id: Optional[str]) -> None:
        """Prepare mcp-use to use a session-specific directory (or latest session when None)."""
        try:
            self.mcp_client.prepare_for_session(session_id)
        except Exception as e:
            logger.warning(f"prepare_session failed: {e}")
    
    # Built-in tool implementations
    
    def _file_read(self, params: Dict[str, Any]) -> str:
        """Read contents of a file"""
        from pathlib import Path
        
        file_path = params.get("path")
        if not file_path:
            raise ValueError("Missing required parameter: path")
        
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    
    def _file_write(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Write contents to a file"""
        from pathlib import Path
        
        file_path = params.get("path")
        content = params.get("content")
        
        if not file_path or content is None:
            raise ValueError("Missing required parameters: path, content")
        
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return {"success": True, "path": str(path)}
    
    def _file_list(self, params: Dict[str, Any]) -> list:
        """List files in a directory"""
        from pathlib import Path
        
        dir_path = params.get("path", ".")
        pattern = params.get("pattern", "*")
        
        path = Path(dir_path)
        if not path.is_dir():
            raise ValueError(f"Not a directory: {dir_path}")
        
        files = list(path.glob(pattern))
        return [str(f) for f in files]
    
    def _json_parse(self, params: Dict[str, Any]) -> Any:
        """Parse JSON string"""
        json_str = params.get("data")
        if not json_str:
            raise ValueError("Missing required parameter: data")
        
        return json.loads(json_str)
    
    def _text_extract(self, params: Dict[str, Any]) -> str:
        """Extract text based on pattern"""
        import re
        
        text = params.get("text", "")
        pattern = params.get("pattern")
        
        if not pattern:
            return text
        
        matches = re.findall(pattern, text)
        return "\n".join(matches) if matches else ""
    
    async def _execute_command(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a system command (with caution)"""
        import subprocess
        
        command = params.get("command")
        if not command:
            raise ValueError("Missing required parameter: command")
        
        # Safety check - only allow certain commands
        allowed_commands = ["ls", "pwd", "echo", "date", "whoami"]
        cmd_parts = command.split()
        if cmd_parts[0] not in allowed_commands:
            raise ValueError(f"Command not allowed: {cmd_parts[0]}")
        
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            return {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {"error": "Command timed out"}
        except Exception as e:
            return {"error": str(e)}
    
    def is_healthy(self) -> bool:
        """Check if service is healthy"""
        return len(self.tools) > 0 or self.mcp_client.is_enabled()
    
    # MCP Client specific methods
    
    async def get_mcp_servers(self) -> List[Dict[str, Any]]:
        """Get list of available MCP servers."""
        return self.mcp_client.get_server_info()
    
    async def activate_mcp_server(self, server_name: str, session_id: Optional[str] = None) -> bool:
        """Activate a specific MCP server."""
        return await self.mcp_client.activate_server(server_name, session_id)
    
    async def deactivate_mcp_server(self):
        """Deactivate the currently active MCP server."""
        await self.mcp_client.deactivate_server()
    
    async def list_mcp_tools(self) -> List[Dict[str, Any]]:
        """List tools available from the active MCP server."""
        return await self.mcp_client.list_tools()
    
    async def execute_mcp_tool(self, tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool on the active MCP server."""
        return await self.mcp_client.execute_tool(tool_name, params)
    
    async def run_intelligent_task(self, task: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Run an intelligent task using MCP agent."""
        return await self.mcp_client.run_intelligent_task(task, context)
    
    def add_mcp_server(self, name: str, command: str, args: List[str], 
                       env: Dict[str, str] = None, description: str = "", icon: str = "🔧") -> bool:
        """Add a new MCP server configuration."""
        try:
            config = MCPServerConfig(
                name=name,
                command=command,
                args=args,
                env=env,
                description=description,
                icon=icon,
                enabled=True
            )
            self.mcp_client.add_server(config)
            return True
        except Exception as e:
            logger.error(f"Failed to add MCP server: {e}")
            return False
    
    def remove_mcp_server(self, name: str) -> bool:
        """Remove an MCP server configuration."""
        try:
            self.mcp_client.remove_server(name)
            return True
        except Exception as e:
            logger.error(f"Failed to remove MCP server: {e}")
            return False
    
    def update_mcp_server(self, name: str, **kwargs) -> bool:
        """Update an MCP server configuration."""
        try:
            self.mcp_client.update_server(name, **kwargs)
            return True
        except Exception as e:
            logger.error(f"Failed to update MCP server: {e}")
            return False