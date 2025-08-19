"""MCP (Model Context Protocol) client integration with LLM enhancement using mcp-use."""

import asyncio
import json
import os
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
        self._llm = None  # cache LLM for reinits
        logger.info(f"Initializing MCPClient - MCP_USE_AVAILABLE: {MCP_USE_AVAILABLE}")
        if not MCP_USE_AVAILABLE:
            logger.error(f"MCP_USE import error: {MCP_USE_IMPORT_ERROR}")
        self._load_config()
        self._initialize_mcp_use()
        self._load_default_servers()
        logger.info(f"MCPClient initialized - mcp_agent available: {self.mcp_agent is not None}")
    
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
                args=["-y", "@modelcontextprotocol/server-filesystem"],
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
        logger.info(f"Starting _initialize_mcp_use - MCP_USE_AVAILABLE: {MCP_USE_AVAILABLE}")
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
            
            self._llm = llm
            if llm:
                # Get MCP config path
                mcp_config_path = Path('config/mcp_config.json')
                
                # Try to initialize mcp-use client with config
                if mcp_config_path.exists():
                    # Update the config with the correct recordings directory
                    self._update_mcp_config_with_recordings_dir()
                    logger.info(f"Loading MCP config from {mcp_config_path}")
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
                    # Try again after creating config
                    if Path('config/mcp_config.json').exists():
                        self.mcp_use_client = MCPUseClient.from_config_file('config/mcp_config.json')
                        if FILTERED_AGENT_AVAILABLE:
                            self.mcp_agent = FilteredMCPAgent(
                                llm=llm, 
                                client=self.mcp_use_client, 
                                max_steps=30
                            )
                        else:
                            self.mcp_agent = MCPAgent(
                                llm=llm, 
                                client=self.mcp_use_client, 
                                max_steps=30
                            )
                        logger.info("✅ Successfully initialized mcp-use after creating config")
            else:
                logger.info("⚠️  Neither OpenAI nor Ollama configured, mcp-use features limited")
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize mcp-use: {e}")
            import traceback
            logger.error(traceback.format_exc())
    
    def _update_mcp_config_with_recordings_dir(self, base_dir: Optional[Path] = None):
        """Update the MCP config file with the correct recordings directory.
        If base_dir is provided, use it as the allowed directory; else use global recordings dir.
        """
        config_path = Path('config/mcp_config.json')
        if config_path.exists():
            try:
                with open(config_path, 'r') as f:
                    config = json.load(f)
                
                # Get the recordings directory
                recordings_dir = Path(base_dir) if base_dir else self._get_recordings_dir()
                
                # Update filesystem server args if it exists
                if 'mcpServers' in config and 'filesystem' in config['mcpServers']:
                    fs_config = config['mcpServers']['filesystem']
                    # Ensure args list exists
                    if 'args' not in fs_config:
                        fs_config['args'] = []
                    
                    # Ensure 'stdio' is not explicitly passed (default is stdio)
                    fs_config['args'] = [arg for arg in fs_config['args'] if arg != 'stdio']
                    
                    # Ensure the recordings directory is provided as allowed directory via args
                    # Remove any previous absolute paths to avoid duplicates
                    fs_config['args'] = [arg for arg in fs_config['args'] if not arg.startswith('/')]
                    fs_config['args'].append(str(recordings_dir))
                    
                    # Write back the updated config
                    with open(config_path, 'w') as f:
                        json.dump(config, f, indent=2)
                    logger.info(f"Updated MCP config with allowed directory in args: {recordings_dir}")
            except Exception as e:
                logger.warning(f"Could not update MCP config: {e}")
    
    def _get_recordings_dir(self) -> Path:
        """Get the recordings directory from config, same logic as recording_service."""
        def _expand_home(path_str: str) -> str:
            """Expand ~ to user home directory."""
            if path_str.startswith('~'):
                return os.path.expanduser(path_str)
            return path_str
        
        # 1) Environment variable
        env_dir = os.environ.get('S2A_RECORDINGS_DIR', '').strip()
        if env_dir:
            resolved = Path(os.path.abspath(_expand_home(env_dir)))
            resolved.mkdir(parents=True, exist_ok=True)
            return resolved
        
        # 2) config/app.json (try several plausible locations)
        here = Path(__file__).resolve()
        possible = [
            Path.cwd() / 'config' / 'app.json',                 # run from project root
            Path.cwd().parent / 'config' / 'app.json',          # run from backend/
            here.parents[3] / 'config' / 'app.json',            # backend/app/services -> config
            here.parents[4] / 'config' / 'app.json',            # alternative path
        ]
        for cfg in possible:
            try:
                if cfg.exists():
                    with open(cfg, 'r') as f:
                        data = json.load(f)
                    rec = (data or {}).get('recordingsDir', '').strip()
                    if rec:
                        resolved = Path(os.path.abspath(_expand_home(rec)))
                        resolved.mkdir(parents=True, exist_ok=True)
                        logger.info(f"Using recordings dir from config {cfg}: {resolved}")
                        return resolved
            except Exception as e:
                logger.warning(f"Error reading config at {cfg}: {e}")
        
        # 3) Fallback to Documents/Screen2Action/recordings
        documents = Path.home() / 'Documents'
        fallback = documents / 'Screen2Action' / 'recordings'
        fallback.mkdir(parents=True, exist_ok=True)
        logger.info(f"Using fallback recordings dir: {fallback}")
        return fallback
    
    def _create_default_config(self):
        """Create a default MCP configuration file."""
        config_dir = Path('config')
        config_dir.mkdir(exist_ok=True)
        
        # Get the recordings directory dynamically
        recordings_dir = self._get_recordings_dir()
        
        default_config = {
            "mcpServers": {
                "filesystem": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-filesystem", str(recordings_dir)]
                }
            }
        }
        
        config_path = config_dir / 'mcp_config.json'
        with open(config_path, 'w') as f:
            json.dump(default_config, f, indent=2)
        logger.info(f"Created default MCP config at {config_path} with recordings dir: {recordings_dir}")
    
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
    
    def _build_roots(self, base_path: str) -> List[Dict[str, Any]]:
        """Build roots payload for MCP Roots protocol from a local path."""
        try:
            uri = Path(base_path).resolve().as_uri()
        except Exception:
            # Fallback to file URI format
            uri = f"file://{os.path.abspath(base_path)}"
        name = Path(base_path).name or "root"
        return [{"uri": uri, "name": name}]
    
    def _get_latest_session_id(self) -> Optional[str]:
        """Return the most recently modified session directory name under recordings dir, if any."""
        base = self._get_recordings_dir()
        try:
            candidates = []
            for entry in os.scandir(base):
                if entry.is_dir():
                    candidates.append((entry.name, entry.stat().st_mtime))
            if not candidates:
                return None
            candidates.sort(key=lambda x: x[1], reverse=True)
            return candidates[0][0]
        except Exception as e:
            logger.debug(f"_get_latest_session_id error: {e}")
            return None
    
    def _resolve_session_dir(self, session_id: Optional[str]) -> Path:
        """Resolve to a specific allowed directory, preferring a session subdir when possible."""
        base = self._get_recordings_dir()
        if session_id:
            return base / session_id
        latest = self._get_latest_session_id()
        if latest:
            logger.info(f"No session_id provided; defaulting to latest session: {latest}")
            return base / latest
        return base
    
    def prepare_for_session(self, session_id: Optional[str]) -> None:
        """Reinitialize mcp-use client/agent to point filesystem connector at a session dir.
        Falls back to base recordings dir if no sessions exist or LLM not configured.
        """
        try:
            if not MCP_USE_AVAILABLE or not self._llm:
                return
            target_dir = self._resolve_session_dir(session_id)
            target_dir.mkdir(parents=True, exist_ok=True)
            # Update config to use this dir
            self._update_mcp_config_with_recordings_dir(target_dir)
            # Close existing client
            if self.mcp_use_client and hasattr(self.mcp_use_client, 'close'):
                try:
                    # mcp_use client close may be async; best effort
                    close_coro = getattr(self.mcp_use_client, 'close')
                    if asyncio.iscoroutinefunction(close_coro):
                        # Run without awaiting here; for safety we can try loop
                        try:
                            loop = asyncio.get_event_loop()
                            loop.create_task(close_coro())
                        except Exception:
                            pass
                    else:
                        close_coro()
                except Exception:
                    pass
            # Recreate client and agent
            self.mcp_use_client = MCPUseClient.from_config_file('config/mcp_config.json')
            if FILTERED_AGENT_AVAILABLE:
                self.mcp_agent = FilteredMCPAgent(llm=self._llm, client=self.mcp_use_client, max_steps=30)
            else:
                self.mcp_agent = MCPAgent(llm=self._llm, client=self.mcp_use_client, max_steps=30)
            logger.info(f"Reinitialized mcp-use client/agent for dir: {target_dir}")
        except Exception as e:
            logger.warning(f"prepare_for_session failed: {e}")
    
    async def activate_server(self, server_name: str, session_id: Optional[str] = None) -> bool:
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
            
            # Add path argument for filesystem server if not already present
            if server_name == 'filesystem':
                # Resolve preferred directory: session-specific if provided or latest, else base dir
                target = self._resolve_session_dir(session_id)
                if session_id:
                    logger.info(f"Starting filesystem server with session path: {str(target)}")
                elif target != self._get_recordings_dir():
                    logger.info(f"Starting filesystem server with latest session path: {str(target)}")
                else:
                    logger.info(f"Starting filesystem server with base path: {str(target)}")
                target.mkdir(parents=True, exist_ok=True)
                recordings_path = str(target)
                
                # Do NOT pass "stdio" as an argument; the server uses stdio by default
                # Append the allowed directory as an argument (restrict to recordings path only)
                cmd.append(recordings_path)
                logger.info(f"Starting filesystem server with allowed path via args: {recordings_path}")
            
            env = dict(os.environ)
            if server.env:
                env.update(server.env)
            
            logger.info(f"Starting MCP server with command: {' '.join(cmd)}")
            
            # For filesystem server, use stdio (default)
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                text=True,
                bufsize=1,  # Line buffered for JSON-RPC
                universal_newlines=True
            )
            
            # Check if process started successfully
            try:
                # Give it a moment to start
                import time
                time.sleep(0.5)
                
                # Check if process is still running
                if process.poll() is not None:
                    # Process terminated
                    stderr_output = process.stderr.read()
                    logger.error(f"MCP server {server_name} failed to start: {stderr_output}")
                    return False
                
                # Initialize the MCP server with proper protocol and roots capability
                init_request = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-06-18",
                        "clientInfo": {
                            "name": "Screen2Action",
                            "version": "1.0.0"
                        },
                        # Advertise roots capability so server can request roots
                        "capabilities": {"tools": {}, "roots": {}}
                    }
                }
                
                logger.info(f"Sending initialization request to {server_name}")
                request_str = json.dumps(init_request)
                logger.debug(f"Sending: {request_str}")
                process.stdin.write(request_str + '\n')
                process.stdin.flush()
                
                # Read initialization response and handle potential roots/list request
                import select
                init_done = False
                roots_served = False
                # Precompute roots based on the path we allow
                allowed_base = recordings_path if server_name == 'filesystem' else str(Path.cwd())
                allowed_roots = self._build_roots(allowed_base)
                deadline = time.time() + 5.0
                while time.time() < deadline:
                    timeout = max(0, deadline - time.time())
                    ready = select.select([process.stdout], [], [], timeout)
                    if not ready[0]:
                        break
                    line = process.stdout.readline()
                    if not line:
                        break
                    line_stripped = line.strip()
                    if not line_stripped:
                        continue
                    logger.debug(f"Received: {line_stripped}")
                    try:
                        msg = json.loads(line_stripped)
                    except json.JSONDecodeError:
                        continue
                    # Handle server-initiated roots request
                    if isinstance(msg, dict) and msg.get("method") == "roots/list" and "id" in msg:
                        try:
                            response = {
                                "jsonrpc": "2.0",
                                "id": msg["id"],
                                "result": {"roots": allowed_roots}
                            }
                            process.stdin.write(json.dumps(response) + '\n')
                            process.stdin.flush()
                            roots_served = True
                            logger.info(f"Replied to roots/list with {allowed_roots}")
                            continue
                        except Exception as e:
                            logger.warning(f"Failed replying to roots/list: {e}")
                            continue
                    # Handle initialize response
                    if msg.get("id") == 1 and ("result" in msg or "error" in msg):
                        init_done = True
                        if "result" in msg:
                            logger.info(f"MCP server {server_name} initialized successfully: {msg.get('result')}")
                            # Proactively notify the server that roots may be available/changed
                            try:
                                notify = {"jsonrpc": "2.0", "method": "roots/list_changed", "params": {}}
                                process.stdin.write(json.dumps(notify) + '\n')
                                process.stdin.flush()
                                logger.debug("Sent roots/list_changed notification")
                            except Exception as e:
                                logger.debug(f"Unable to send roots/list_changed: {e}")
                        else:
                            logger.error(f"Failed to initialize MCP server: {msg}")
                        # Do not break immediately; there could be a subsequent roots request
                        # We'll continue until deadline or we already served roots.
                        continue
                
                # Verify process is still running
                if process.poll() is not None:
                    stderr_output = process.stderr.read()
                    logger.error(f"MCP server terminated after init: {stderr_output}")
                    return False
                
                self.server_processes[server_name] = process
                self.active_server = server_name
                logger.info(f"Activated MCP server: {server_name}")
                return True
                
            except Exception as e:
                logger.error(f"Error during server initialization: {e}")
                if process.poll() is None:
                    process.terminate()
                return False
            
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
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": params
                }
            }
            
            # Send request (process opened in text mode)
            process.stdin.write(json.dumps(request) + '\n')
            process.stdin.flush()
            
            # Read response
            response_line = process.stdout.readline()
            if not response_line:
                return {"error": "No response from MCP server"}
                
            response = json.loads(response_line.strip())
            
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
        
        # Check if process is still alive
        if process.poll() is not None:
            logger.error(f"MCP server {self.active_server} has terminated")
            # Clean up dead process
            del self.server_processes[self.active_server]
            self.active_server = None
            return []
        
        try:
            # Request tools list
            request = {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list",
                "params": {}
            }
            
            logger.debug(f"Sending tools/list request to {self.active_server}")
            process.stdin.write(json.dumps(request) + '\n')
            process.stdin.flush()
            
            # Read response with timeout
            import select
            ready = select.select([process.stdout], [], [], 2.0)  # 2 second timeout
            if ready[0]:
                response_line = process.stdout.readline()
                if not response_line:
                    logger.error("No response from MCP server")
                    return []
                    
                response = json.loads(response_line.strip())
                logger.debug(f"Tools list response: {response}")
                
                if "result" in response and "tools" in response["result"]:
                    tools = response["result"]["tools"]
                    logger.info(f"Found {len(tools)} tools from {self.active_server}")
                    return tools
                elif "error" in response:
                    logger.error(f"Error from MCP server: {response['error']}")
                    return []
            else:
                logger.warning(f"Timeout waiting for tools list from {self.active_server}")
                return []
            
        except BrokenPipeError:
            logger.error(f"Broken pipe - MCP server {self.active_server} has terminated")
            # Clean up dead process
            if self.active_server in self.server_processes:
                del self.server_processes[self.active_server]
            self.active_server = None
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