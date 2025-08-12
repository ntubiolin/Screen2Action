import logging
from typing import Dict, Any, Callable, Optional
import json

logger = logging.getLogger(__name__)

class MCPService:
    """Model Context Protocol (MCP) Tool Service"""
    
    def __init__(self):
        self.tools: Dict[str, Callable] = {}
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
        return len(self.tools) > 0