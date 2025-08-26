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
                # Print configuration details
                masked_key = azure_api_key[:8] + "..." + azure_api_key[-4:] if len(azure_api_key) > 12 else "***"
                logger.info("=" * 60)
                logger.info("🔵 AZURE OPENAI CONFIGURATION")
                logger.info("=" * 60)
                logger.info(f"Service: Azure OpenAI")
                logger.info(f"Endpoint: {azure_endpoint}")
                logger.info(f"API Key: {masked_key}")
                logger.info(f"API Version: {azure_api_version}")
                logger.info(f"Deployment: {azure_deployment}")
                logger.info(f"Model: {self.model}")
                logger.info("=" * 60)
            except Exception as e:
                logger.error(f"Failed to initialize Azure OpenAI client: {e}")
        elif self.api_key:
            try:
                from openai import OpenAI
                self.client = OpenAI(api_key=self.api_key)
                # Print configuration details
                masked_key = self.api_key[:8] + "..." + self.api_key[-4:] if len(self.api_key) > 12 else "***"
                logger.info("=" * 60)
                logger.info("🟢 OPENAI CONFIGURATION")
                logger.info("=" * 60)
                logger.info(f"Service: OpenAI")
                logger.info(f"API Key: {masked_key}")
                logger.info(f"Model: {self.model}")
                logger.info("=" * 60)
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
    
    async def analyze_screenshot(self, command: str, screenshot_path: str, support_grounding: bool = False) -> Dict[str, Any]:
        """Analyze screenshot with VLM grounding capabilities"""
        if not self.client:
            return {
                "success": False,
                "response": "LLM service not configured. Please set OPENAI_API_KEY or Azure OpenAI credentials."
            }
        
        try:
            import base64
            import os
            
            # Read and encode the screenshot
            image_data = None
            if screenshot_path and os.path.exists(screenshot_path):
                with open(screenshot_path, "rb") as image_file:
                    image_data = base64.b64encode(image_file.read()).decode('utf-8')
            elif screenshot_path and screenshot_path.startswith("file://"):
                # Handle file:// URLs
                local_path = screenshot_path.replace("file://", "")
                if os.path.exists(local_path):
                    with open(local_path, "rb") as image_file:
                        image_data = base64.b64encode(image_file.read()).decode('utf-8')
            
            if not image_data:
                return {
                    "success": False,
                    "response": "Screenshot file not found"
                }
            
            # Prepare system prompt with grounding instructions
            system_prompt = """You are an AI assistant that analyzes screenshots and provides visual grounding information.
            
            When analyzing the image:
            1. Describe what you see in the screenshot
            2. Identify key elements relevant to the user's command
            
            If the user asks for visual annotations (bounding boxes, arrows, cropping):
            - For bounding boxes: Return coordinates as {"type": "bbox", "coordinates": [x, y, width, height], "label": "description"}
            - For cropping: Return crop region as {"type": "crop", "coordinates": [x, y, width, height]}
            - For arrows/pointing: Return point coordinates as {"type": "arrow", "coordinates": [x, y], "label": "description"}
            
            Coordinates should be in pixels relative to the original image dimensions.
            Always provide helpful descriptions along with any annotations."""
            
            # Detect if command requires grounding
            grounding_keywords = ['标示', '標示', 'mark', 'highlight', 'box', '框', 
                                '裁切', 'crop', 'cut', '剪切',
                                '标注', '標註', 'annotate', 'arrow', '箭头', '箭頭']
            
            needs_grounding = support_grounding and any(keyword in command.lower() for keyword in grounding_keywords)
            
            # Prepare messages for GPT-4V
            messages = [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": command},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_data}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ]
            
            # Use GPT-4 Vision model for image analysis
            # gpt-4o and gpt-4-turbo support vision, gpt-4-vision-preview is deprecated
            if "gpt-4" in self.model:
                model_to_use = "gpt-4o" if "gpt-4o" in self.model else "gpt-4-turbo"
            else:
                model_to_use = self.model
            
            response = self.client.chat.completions.create(
                model=model_to_use,
                messages=messages,
                max_tokens=1000,
                temperature=0.5
            )
            
            response_text = response.choices[0].message.content
            
            # Parse annotations if grounding is needed
            annotations = []
            if needs_grounding:
                # Try to extract annotation data from response
                import re
                import json
                
                # Look for JSON-like structures in the response
                json_pattern = r'\{[^}]*"type"\s*:\s*"(bbox|crop|arrow)"[^}]*\}'
                matches = re.findall(json_pattern, response_text)
                
                for match in matches:
                    try:
                        # Find the full JSON object
                        start = response_text.find(match) - 1
                        depth = 0
                        end = start
                        for i, char in enumerate(response_text[start:]):
                            if char == '{':
                                depth += 1
                            elif char == '}':
                                depth -= 1
                                if depth == 0:
                                    end = start + i + 1
                                    break
                        
                        if end > start:
                            json_str = response_text[start:end]
                            annotation = json.loads(json_str)
                            annotations.append(annotation)
                    except:
                        pass
            
            return {
                "success": True,
                "response": response_text,
                "annotations": annotations
            }
            
        except Exception as e:
            logger.error(f"Failed to analyze screenshot: {e}")
            return {
                "success": False,
                "response": f"Error analyzing screenshot: {str(e)}",
                "annotations": []
            }
    
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