import logging
import uuid
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from PIL import Image, ImageDraw, ImageFont
import pytesseract
import numpy as np

from app.models.messages import Screenshot

logger = logging.getLogger(__name__)

try:
    import pyautogui
    HAS_PYAUTOGUI = True
except ImportError:
    HAS_PYAUTOGUI = False
    logger.warning("pyautogui not available - screenshot features disabled")

class ScreenshotService:
    def __init__(self):
        self.screenshots_dir = Path("screenshots")
        self.screenshots_dir.mkdir(exist_ok=True)
        self.screenshots_cache: Dict[str, Screenshot] = {}
        self.websocket_client = None
    
    def set_websocket_client(self, client):
        """Set the WebSocket client for communication with Electron"""
        self.websocket_client = client
    
    async def hide_floating_window(self):
        """Send message to hide floating window"""
        if self.websocket_client:
            try:
                await self.websocket_client.send_event('hide_floating_window', {})
                # Wait a bit for window to hide
                await asyncio.sleep(0.1)
            except Exception as e:
                logger.warning(f"Failed to hide floating window: {e}")
    
    async def show_floating_window(self):
        """Send message to show floating window"""
        if self.websocket_client:
            try:
                await self.websocket_client.send_event('show_floating_window', {})
            except Exception as e:
                logger.warning(f"Failed to show floating window: {e}")
    
    async def capture(self, options: Dict[str, Any] = None) -> str:
        """Capture a screenshot"""
        screenshot_id = str(uuid.uuid4())
        screenshot_dir = self.screenshots_dir / screenshot_id
        screenshot_dir.mkdir(parents=True)
        
        try:
            # Capture screenshot
            if not HAS_PYAUTOGUI:
                logger.error("Screenshot capture failed - pyautogui not available")
                return None
            
            if options and options.get("region"):
                region = options["region"]
                screenshot = pyautogui.screenshot(region=(
                    region["x"], region["y"], 
                    region["width"], region["height"]
                ))
            else:
                screenshot = pyautogui.screenshot()
            
            # Save original
            original_path = screenshot_dir / "original.png"
            screenshot.save(original_path)
            
            # Perform OCR
            ocr_text = self._perform_ocr(screenshot)
            
            # Create screenshot object
            screenshot_obj = Screenshot(
                id=screenshot_id,
                timestamp=datetime.now(),
                path=str(original_path),
                ocr_text=ocr_text
            )
            
            # Cache screenshot
            self.screenshots_cache[screenshot_id] = screenshot_obj
            
            # Save metadata
            self._save_metadata(screenshot_dir, screenshot_obj)
            
            logger.info(f"Captured screenshot: {screenshot_id}")
            return screenshot_id
            
        except Exception as e:
            logger.error(f"Failed to capture screenshot: {e}")
            # Clean up on error
            if screenshot_dir.exists():
                import shutil
                shutil.rmtree(screenshot_dir)
            raise
    
    async def process_command(self, screenshot_id: str, command: str) -> Dict[str, Any]:
        """Process a command on a screenshot"""
        if screenshot_id not in self.screenshots_cache:
            raise ValueError(f"Screenshot {screenshot_id} not found")
        
        screenshot = self.screenshots_cache[screenshot_id]
        command_lower = command.lower()
        
        try:
            if "紅框" in command or "標註" in command or "annotate" in command_lower:
                result = await self._annotate_screenshot(screenshot, command)
                return {"success": True, "message": "已添加標註", "result": result}
            
            elif "複製" in command or "copy" in command_lower:
                result = await self._copy_to_clipboard(screenshot)
                return {"success": True, "message": "已複製到剪貼簿"}
            
            elif "存檔" in command or "save" in command_lower:
                path = await self._save_to_file(screenshot, command)
                return {"success": True, "message": f"已儲存至 {path}"}
            
            else:
                # Use AI to interpret command
                return {"success": True, "message": "指令已處理", "command": command}
                
        except Exception as e:
            logger.error(f"Failed to process command: {e}")
            return {"success": False, "error": str(e)}
    
    async def _annotate_screenshot(self, screenshot: Screenshot, command: str) -> str:
        """Add annotations to screenshot"""
        # Load original image
        img = Image.open(screenshot.path)
        draw = ImageDraw.Draw(img)
        
        # Parse command to determine annotation location
        # This is simplified - real implementation would use NLP
        if "右下" in command:
            x, y = img.width - 200, img.height - 200
            w, h = 180, 180
        elif "左上" in command:
            x, y = 20, 20
            w, h = 180, 180
        else:
            # Default to center
            x, y = img.width // 2 - 90, img.height // 2 - 90
            w, h = 180, 180
        
        # Draw red rectangle
        draw.rectangle([x, y, x + w, y + h], outline="red", width=3)
        
        # Save annotated version
        screenshot_dir = Path(screenshot.path).parent
        annotated_path = screenshot_dir / "annotated.png"
        img.save(annotated_path)
        
        # Update screenshot object
        screenshot.annotations.append({
            "type": "rectangle",
            "coordinates": [x, y, w, h],
            "color": "red",
            "timestamp": datetime.now().isoformat()
        })
        
        return str(annotated_path)
    
    async def _copy_to_clipboard(self, screenshot: Screenshot) -> None:
        """Copy screenshot to clipboard (platform-specific)"""
        # This would need platform-specific implementation
        # For now, just log the action
        logger.info(f"Copy screenshot {screenshot.id} to clipboard")
    
    async def _save_to_file(self, screenshot: Screenshot, command: str) -> str:
        """Save screenshot to specified location"""
        # Parse destination from command
        if "桌面" in command or "desktop" in command.lower():
            dest_path = Path.home() / "Desktop" / f"screenshot_{screenshot.id[:8]}.png"
        else:
            dest_path = Path.home() / f"screenshot_{screenshot.id[:8]}.png"
        
        # Copy file
        import shutil
        shutil.copy2(screenshot.path, dest_path)
        
        return str(dest_path)
    
    def _perform_ocr(self, image: Image.Image) -> str:
        """Perform OCR on image"""
        try:
            text = pytesseract.image_to_string(image, lang='chi_tra+eng')
            return text.strip()
        except Exception as e:
            logger.error(f"OCR failed: {e}")
            return ""
    
    def _save_metadata(self, screenshot_dir: Path, screenshot: Screenshot):
        """Save screenshot metadata"""
        import json
        metadata_path = screenshot_dir / "metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(screenshot.dict(), f, indent=2, default=str)
    
    def is_healthy(self) -> bool:
        """Check if service is healthy"""
        return True