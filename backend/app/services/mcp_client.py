"""MCP (Model Context Protocol) client integration with LLM enhancement using mcp-use."""

import asyncio
import json
import subprocess
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

try:
    from mcp_use import MCPAgent, MCPClient as MCPUseClient
    from langchain_openai import ChatOpenAI
    from langchain_ollama import ChatOllama
    MCP_USE_AVAILABLE = True
    MCP_USE_IMPORT_ERROR = None
    # Import our custom filtered agent
    try:
        from .mcp_agent_wrapper import FilteredMCPAgent
        FILTERED_AGENT_AVAILABLE = True
    except ImportError:
        FILTERED_AGENT_AVAILABLE = False
except ImportError as e:
    MCP_USE_AVAILABLE = False
    MCP_USE_IMPORT_ERROR = str(e)
    FILTERED_AGENT_AVAILABLE = False

logger = logging.getLogger(__name__)


@dataclass
class MCPServerConfig:
    """Configuration for an MCP server."""
    name: str
    command: str
    args: List[str]
    env: Optional[Dict[str, str]] = None
    enabled: bool = True
    description: str = ""
    icon: str = "🔧"


class MCPClient:
    """Enhanced MCP client with mcp-use integration for intelligent task execution."""
    
    def __init__(self):
        self.servers: Dict[str, MCPServerConfig] = {}
        self.mcp_use_client = None
        self.mcp_agent = None
        self.active_server: Optional[str] = None
        self.server_processes: Dict[str, subprocess.Popen] = {}
        self._load_config()
        self._initialize_mcp_use()
        self._load_default_servers()
    
    async def __aenter__(self):
        """Async context manager entry."""
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with proper cleanup."""
        await self.close()
    
    async def close(self):
        """Properly close all MCP connections and cleanup resources."""
        # Close all server processes
        for name, process in self.server_processes.items():
            try:
                process.terminate()
                await asyncio.sleep(0.1)
                if process.poll() is None:
                    process.kill()
            except Exception as e:
                logger.warning(f"Error closing server process {name}: {e}")
        self.server_processes.clear()
        
        # Close mcp-use client
        if self.mcp_use_client:
            try:
                if hasattr(self.mcp_use_client, 'close'):
                    await self.mcp_use_client.close()
                logger.debug("mcp-use client closed successfully")
            except Exception as e:
                logger.warning(f"Error closing mcp-use client: {e}")
            finally:
                self.mcp_use_client = None
                self.mcp_agent = None
    
    def _load_default_servers(self):
        """Load default MCP server configurations."""
        # Built-in MCP servers
        default_servers = [
            MCPServerConfig(
                name="filesystem",
                command="npx",
                args=["-y", "@modelcontextprotocol/server-filesystem", "stdio"],
                description="File system operations (read, write, list)",
                icon="📁",
                enabled=True
            ),
            MCPServerConfig(
                name="web-search",
                command="npx",
                args=["-y", "@modelcontextprotocol/server-brave-search", "stdio"],
                env={"BRAVE_API_KEY": ""},  # User needs to set this
                description="Web search using Brave Search API",
                icon="🔍",
                enabled=False  # Disabled by default until API key is set
            ),
            MCPServerConfig(
                name="github",
                command="npx",
                args=["-y", "@modelcontextprotocol/server-github", "stdio"],
                env={"GITHUB_TOKEN": ""},  # User needs to set this
                description="GitHub repository operations",
                icon="🐙",
                enabled=False
            ),
            MCPServerConfig(
                name="postgres",
                command="npx",
                args=["-y", "@modelcontextprotocol/server-postgres", "stdio"],
                env={"DATABASE_URL": ""},  # User needs to set this
                description="PostgreSQL database operations",
                icon="🐘",
                enabled=False
            ),
            MCPServerConfig(
                name="puppeteer",
                command="npx",
                args=["-y", "@modelcontextprotocol/server-puppeteer", "stdio"],
                description="Web browser automation",
                icon="🎭",
                enabled=True
            ),
            MCPServerConfig(
                name="memory",
                command="npx",
                args=["-y", "@modelcontextprotocol/server-memory", "stdio"],
                description="In-memory knowledge graph",
                icon="🧠",
                enabled=True
            )
        ]
        
        for server in default_servers:
            if server.name not in self.servers:
                self.servers[server.name] = server
                logger.info(f"Loaded default server: {server.name} ({server.description})")
    
    def _initialize_mcp_use(self):
        """Initialize mcp-use client and agent if available."""
        if not MCP_USE_AVAILABLE:
            logger.info(f"mcp-use not available ({MCP_USE_IMPORT_ERROR}), using traditional MCP processing only")
            return
        
        try:
            # Check for LLM configuration
            import os
            llm = None
            
            # Try OpenAI first
            openai_key = os.getenv('OPENAI_API_KEY')
            if openai_key:
                llm = ChatOpenAI(
                    model=os.getenv('OPENAI_MODEL', 'gpt-4o'),
                    api_key=openai_key,
                    temperature=0.3
                )
                logger.info(f"Initialized OpenAI LLM with model: {os.getenv('OPENAI_MODEL', 'gpt-4o')}")
            else:
                # Try Ollama
                try:
                    llm = ChatOllama(
                        model=os.getenv('OLLAMA_MODEL', 'llama3.2'),
                        base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434'),
                        temperature=0.3
                    )
                    logger.info(f"Initialized Ollama LLM with model: {os.getenv('OLLAMA_MODEL', 'llama3.2')}")
                except Exception as e:
                    logger.warning(f"Failed to initialize Ollama: {e}")
            
            if llm:
                # Get MCP config path
                mcp_config_path = Path('config/mcp_config.json')
                
                # Try to initialize mcp-use client with config
                if mcp_config_path.exists():
                    self.mcp_use_client = MCPUseClient.from_config_file(str(mcp_config_path))
                    
                    # Use FilteredMCPAgent if available, otherwise fallback to regular MCPAgent
                    if FILTERED_AGENT_AVAILABLE:
                        self.mcp_agent = FilteredMCPAgent(
                            llm=llm, 
                            client=self.mcp_use_client, 
                            max_steps=30
                        )
                        logger.info("✅ Successfully initialized mcp-use client with FilteredMCPAgent")
                    else:
                        self.mcp_agent = MCPAgent(
                            llm=llm, 
                            client=self.mcp_use_client, 
                            max_steps=30
                        )
                        logger.info("✅ Successfully initialized mcp-use client and standard agent")
                else:
                    logger.info("⚠️  No mcp-use config file found, creating default config")
                    self._create_default_config()
            else:
                logger.info("⚠️  Neither OpenAI nor Ollama configured, mcp-use features limited")
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize mcp-use: {e}")
    
    def _create_default_config(self):
        """Create a default MCP configuration file."""
        config_dir = Path('config')
        config_dir.mkdir(exist_ok=True)
        
        default_config = {
            "mcpServers": {
                "filesystem": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-filesystem", "stdio"]
                }
            }
        }
        
        config_path = config_dir / 'mcp_config.json'
        with open(config_path, 'w') as f:
            json.dump(default_config, f, indent=2)
        logger.info(f"Created default MCP config at {config_path}")
    
    async def run_intelligent_task(self, task_description: str, context_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Run an intelligent task using mcp-use agent."""
        if not self.mcp_agent:
            return {"error": "MCP agent not available", "fallback": True}
        
        try:
            # Enhance task description with context
            if context_data:
                enhanced_task = f"{task_description}\n\nContext:\n"
                for key, value in context_data.items():
                    if isinstance(value, str) and len(value) > 200:
                        enhanced_task += f"- {key}: {value[:200]}...\n"
                    else:
                        enhanced_task += f"- {key}: {value}\n"
            else:
                enhanced_task = task_description
            
            # Run the agent
            result = await self.mcp_agent.run(enhanced_task)
            
            return {
                "success": True,
                "result": result,
                "agent_used": True
            }
            
        except Exception as e:
            logger.error(f"MCP agent task failed: {e}")
            return {"error": str(e), "agent_used": True}
    
    def is_agent_available(self) -> bool:
        """Check if mcp-use agent is available."""
        return self.mcp_agent is not None
    
    def _load_config(self):
        """Load MCP server configurations from file."""
        config_path = Path('config/mcp_servers.json')
        
        if config_path.exists():
            try:
                with open(config_path, 'r') as f:
                    config_data = json.load(f)
                    
                for name, server_data in config_data.get('servers', {}).items():
                    server = MCPServerConfig(
                        name=name,
                        command=server_data.get('command', ''),
                        args=server_data.get('args', []),
                        env=server_data.get('env'),
                        enabled=server_data.get('enabled', True),
                        description=server_data.get('description', ''),
                        icon=server_data.get('icon', '🔧')
                    )
                    self.servers[name] = server
                    logger.info(f"Loaded server config: {name}")
                    
            except Exception as e:
                logger.error(f"Failed to load MCP config: {e}")
    
    def save_config(self):
        """Save current MCP server configurations to file."""
        config_path = Path('config/mcp_servers.json')
        config_path.parent.mkdir(exist_ok=True)
        
        config_data = {
            'servers': {
                name: {
                    'command': server.command,
                    'args': server.args,
                    'env': server.env,
                    'enabled': server.enabled,
                    'description': server.description,
                    'icon': server.icon
                }
                for name, server in self.servers.items()
            }
        }
        
        with open(config_path, 'w') as f:
            json.dump(config_data, f, indent=2)
        logger.info("Saved MCP server configurations")
    
    def is_enabled(self) -> bool:
        """Check if MCP integration is enabled."""
        return len(self.get_enabled_servers()) > 0
    
    def get_enabled_servers(self) -> List[MCPServerConfig]:
        """Get list of enabled MCP servers."""
        return [server for server in self.servers.values() if server.enabled]
    
    def get_server_info(self) -> List[Dict[str, Any]]:
        """Get information about all configured servers."""
        return [
            {
                'name': server.name,
                'description': server.description,
                'icon': server.icon,
                'enabled': server.enabled,
                'active': server.name == self.active_server
            }
            for server in self.servers.values()
        ]
    
    async def activate_server(self, server_name: str) -> bool:
        """Activate a specific MCP server."""
        import os
        
        if server_name not in self.servers:
            logger.error(f"Server {server_name} not found")
            return False
        
        server = self.servers[server_name]
        if not server.enabled:
            logger.warning(f"Server {server_name} is not enabled")
            return False
        
        # Deactivate current server if any
        if self.active_server:
            await self.deactivate_server()
        
        try:
            # Start the server process
            cmd = [server.command] + server.args
            env = dict(os.environ)
            if server.env:
                env.update(server.env)
            
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env
            )
            
            self.server_processes[server_name] = process
            self.active_server = server_name
            logger.info(f"Activated MCP server: {server_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to activate server {server_name}: {e}")
            return False
    
    async def deactivate_server(self):
        """Deactivate the currently active server."""
        if not self.active_server:
            return
        
        if self.active_server in self.server_processes:
            process = self.server_processes[self.active_server]
            try:
                process.terminate()
                await asyncio.sleep(0.1)
                if process.poll() is None:
                    process.kill()
            except Exception as e:
                logger.warning(f"Error deactivating server {self.active_server}: {e}")
            
            del self.server_processes[self.active_server]
        
        logger.info(f"Deactivated MCP server: {self.active_server}")
        self.active_server = None
    
    async def execute_tool(self, tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool on the active MCP server."""
        if not self.active_server:
            return {"error": "No active MCP server"}
        
        if self.active_server not in self.server_processes:
            return {"error": "Active server process not found"}
        
        process = self.server_processes[self.active_server]
        
        try:
            # MCP protocol: Call tool
            request = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": params
                }
            }
            
            # Send request
            request_json = json.dumps(request) + '\n'
            process.stdin.write(request_json.encode())
            process.stdin.flush()
            
            # Read response
            response_line = process.stdout.readline()
            response = json.loads(response_line.decode().strip())
            
            if "error" in response:
                logger.error(f"Tool {tool_name} returned error: {response['error']}")
                return {"error": response["error"]}
            
            return response.get("result", {})
            
        except Exception as e:
            logger.error(f"Failed to execute tool {tool_name}: {e}")
            return {"error": str(e)}
    
    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools from the active MCP server."""
        if not self.active_server:
            return []
        
        if self.active_server not in self.server_processes:
            return []
        
        process = self.server_processes[self.active_server]
        
        try:
            # Request tools list
            request = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list",
                "params": {}
            }
            
            process.stdin.write((json.dumps(request) + '\n').encode())
            process.stdin.flush()
            
            # Read response
            response_line = process.stdout.readline()
            response = json.loads(response_line.decode().strip())
            
            if "result" in response and "tools" in response["result"]:
                return response["result"]["tools"]
            
            return []
            
        except Exception as e:
            logger.error(f"Failed to list tools: {e}")
            return []
    
    def add_server(self, server_config: MCPServerConfig):
        """Add an MCP server configuration."""
        self.servers[server_config.name] = server_config
        self.save_config()
    
    def remove_server(self, name: str):
        """Remove an MCP server configuration."""
        if name in self.servers:
            del self.servers[name]
            self.save_config()
    
    def update_server(self, name: str, **kwargs):
        """Update an MCP server configuration."""
        if name in self.servers:
            server = self.servers[name]
            for key, value in kwargs.items():
                if hasattr(server, key):
                    setattr(server, key, value)
            self.save_config()
    
    def list_servers(self) -> List[str]:
        """List all configured MCP server names."""
        return list(self.servers.keys())