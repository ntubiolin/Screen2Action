import logging
import os
from typing import Dict, Any, Optional, List
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("LLM_MODEL", "gpt-4")
        self.client = None
        
        # Check for Azure OpenAI configuration
        azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        azure_api_key = os.getenv("AZURE_OPENAI_API_KEY")
        azure_api_version = os.getenv("AZURE_OPENAI_API_VERSION")
        azure_deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
        
        if azure_endpoint and azure_api_key and azure_api_version and azure_deployment:
            try:
                from openai import AzureOpenAI
                self.client = AzureOpenAI(
                    azure_endpoint=azure_endpoint,
                    api_key=azure_api_key,
                    api_version=azure_api_version
                )
                # Use Azure deployment name as model
                self.model = azure_deployment
                logger.info(f"Azure OpenAI client initialized with deployment: {azure_deployment}")
            except Exception as e:
                logger.error(f"Failed to initialize Azure OpenAI client: {e}")
        elif self.api_key:
            try:
                from openai import OpenAI
                self.client = OpenAI(api_key=self.api_key)
                logger.info("OpenAI client initialized")
            except Exception as e:
                logger.error(f"Failed to initialize OpenAI client: {e}")
    
    async def enhance_note(self, prompt: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Enhance or process a note with AI"""
        if not self.client:
            return {"response": "LLM service not configured. Please set OPENAI_API_KEY or Azure OpenAI credentials."}
        
        try:
            # Prepare system prompt
            system_prompt = """You are an AI assistant helping to enhance meeting notes. 
            You can help with:
            - Summarizing content
            - Reformatting for clarity
            - Extracting action items
            - Translating to other languages
            - Adding context and background information
            """
            
            # Prepare user message
            note_content = context.get("noteContent", "")
            user_message = f"{prompt}\n\nNote content:\n{note_content}"
            
            # Call OpenAI API
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.7,
                max_tokens=1000
            )
            
            result = response.choices[0].message.content
            return {"response": result}
            
        except Exception as e:
            logger.error(f"Failed to enhance note: {e}")
            return {"response": f"Error processing request: {str(e)}"}
    
    async def process_screenshot_command(self, command: str, ocr_text: str = "") -> Dict[str, Any]:
        """Process natural language commands for screenshots"""
        if not self.client:
            return {"intent": "unknown", "parameters": {}}
        
        try:
            system_prompt = """You are an AI assistant that interprets screenshot commands.
            Analyze the user's command and extract:
            1. Intent (annotate, save, copy, extract_text, etc.)
            2. Parameters (location, color, destination, etc.)
            
            Return as JSON format.
            """
            
            user_message = f"Command: {command}"
            if ocr_text:
                user_message += f"\n\nOCR Text from image:\n{ocr_text}"
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.3,
                max_tokens=200,
                response_format={"type": "json_object"}
            )
            
            import json
            result = json.loads(response.choices[0].message.content)
            return result
            
        except Exception as e:
            logger.error(f"Failed to process screenshot command: {e}")
            return {"intent": "unknown", "parameters": {}}
    
    async def process_general(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Process general AI requests"""
        if not self.client:
            return {"response": "LLM service not configured"}
        
        try:
            prompt = payload.get("prompt", "")
            context = payload.get("context", {})
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=1000
            )
            
            result = response.choices[0].message.content
            return {"response": result}
            
        except Exception as e:
            logger.error(f"Failed to process general request: {e}")
            return {"response": f"Error: {str(e)}"}
    
    def is_healthy(self) -> bool:
        """Check if service is healthy"""
        return self.client is not None