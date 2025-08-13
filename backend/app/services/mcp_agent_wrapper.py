"""
Custom MCP Agent wrapper that filters large image data from intermediate steps.
This prevents token limit errors when processing screenshots with mcp-use.
"""

import re
import logging
from typing import Any, AsyncGenerator, TypeVar, Dict, List, Tuple
from langchain.schema import BaseMessage, AgentAction
from langchain.agents import AgentExecutor
from mcp_use.agents.mcpagent import MCPAgent
from pydantic import BaseModel

# Type variable for structured output
T = TypeVar("T", bound=BaseModel)

logger = logging.getLogger(__name__)


class FilteredAgentExecutor(AgentExecutor):
    """Custom AgentExecutor that filters large data from intermediate steps."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._full_observations = {}
        
    def _filter_large_data(self, observation: str, step_num: int) -> str:
        """Filter large base64 data from observations while preserving references."""
        # Check if this looks like base64 image data
        if len(observation) > 1000 and "iVBORw0KGg" in observation[:100]:
            # Store the full observation
            self._full_observations[step_num] = observation
            # Return a placeholder
            return f"[Large image data filtered - {len(observation)} characters. Successfully read image at step {step_num}]"
        
        # Also check for base64 patterns in general
        base64_pattern = r'[A-Za-z0-9+/]{500,}={0,2}'
        if len(observation) > 5000 and re.search(base64_pattern, observation):
            # Store the full observation
            self._full_observations[step_num] = observation
            # Return a truncated version
            truncated = observation[:200] + f"\n[... truncated {len(observation) - 200} characters of data. Full content preserved for final processing]"
            return truncated
            
        return observation
    
    async def _atake_next_step(
        self,
        name_to_tool_map: Dict[str, Any],
        color_mapping: Dict[str, str],
        inputs: Dict[str, Any],
        intermediate_steps: List[Tuple[AgentAction, str]],
        run_manager=None,
    ) -> Any:
        """Override to filter intermediate steps before passing to LLM."""
        # Create filtered intermediate steps
        filtered_steps = []
        for i, (action, observation) in enumerate(intermediate_steps):
            filtered_obs = self._filter_large_data(str(observation), i)
            filtered_steps.append((action, filtered_obs))
        
        # Log the filtering
        if len(filtered_steps) != len(intermediate_steps):
            logger.debug(f"Filtered {len(intermediate_steps)} steps")
            
        # Call parent with filtered steps
        return await super()._atake_next_step(
            name_to_tool_map=name_to_tool_map,
            color_mapping=color_mapping,
            inputs=inputs,
            intermediate_steps=filtered_steps,
            run_manager=run_manager,
        )


class FilteredMCPAgent(MCPAgent):
    """MCPAgent wrapper that uses FilteredAgentExecutor to prevent token limit errors."""
    
    def _create_agent(self) -> FilteredAgentExecutor:
        """Create the LangChain agent with filtered executor."""
        # First create the standard agent components
        agent = super()._create_agent()
        
        # Replace with our filtered executor
        filtered_executor = FilteredAgentExecutor(
            agent=agent.agent,
            tools=agent.tools,
            max_iterations=agent.max_iterations,
            verbose=agent.verbose
        )
        
        return filtered_executor