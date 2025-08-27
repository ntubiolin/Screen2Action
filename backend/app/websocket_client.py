"""
WebSocket client that connects to Electron's WebSocket server
"""
import asyncio
import json
import logging
import websockets
from typing import Optional, Callable

logger = logging.getLogger(__name__)

class WebSocketClient:
    def __init__(self, url: str = "ws://localhost:8765"):
        self.url = url
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.message_handler: Optional[Callable] = None
        # running indicates an active connection
        self.running = False
        # _stop is set to True when a graceful shutdown is requested
        self._stop = False
        
    async def connect(self):
        """Connect to the Electron WebSocket server"""
        try:
            self.websocket = await websockets.connect(self.url)
            self.running = True
            logger.info(f"Connected to Electron WebSocket server at {self.url}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to WebSocket server: {e}")
            return False
    
    async def disconnect(self):
        """Disconnect from the WebSocket server"""
        # Mark stop requested so run() loop can exit
        self._stop = True
        self.running = False
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
            logger.info("Disconnected from WebSocket server")
    
    async def send_message(self, message: dict):
        """Send a message to the Electron app"""
        if not self.websocket:
            logger.error("WebSocket not connected")
            return
        
        try:
            await self.websocket.send(json.dumps(message))
            logger.debug(f"Sent message: {message}")
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
    
    async def send_response(self, request_id: str, payload: dict):
        """Send a response to a specific request"""
        await self.send_message({
            "type": "response",
            "id": request_id,
            "payload": payload,
            "timestamp": asyncio.get_event_loop().time()
        })
    
    async def send_event(self, action: str, payload: dict):
        """Send an event to the Electron app"""
        await self.send_message({
            "type": "event",
            "action": action,
            "payload": payload,
            "timestamp": asyncio.get_event_loop().time()
        })
    
    async def listen(self):
        """Listen for messages from the Electron app"""
        if not self.websocket:
            logger.error("WebSocket not connected")
            return
        
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    logger.debug(f"Received message: {data}")
                    
                    if self.message_handler:
                        await self.message_handler(data)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse message: {e}")
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket connection closed")
            self.running = False
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
            self.running = False
    
    def set_message_handler(self, handler: Callable):
        """Set the message handler function"""
        self.message_handler = handler
    
    async def run(self):
        """Run the WebSocket client with robust auto-reconnect.

        Keeps attempting to connect to the Electron WebSocket server until a
        graceful shutdown is requested via disconnect().
        """
        backoff_seconds = 2
        max_backoff = 10

        while not self._stop:
            try:
                connected = await self.connect()
                if not connected:
                    if self._stop:
                        break
                    logger.info(f"Connect failed; retrying in {backoff_seconds}s...")
                    await asyncio.sleep(backoff_seconds)
                    backoff_seconds = min(max_backoff, backoff_seconds * 2)
                    continue

                # Reset backoff after successful connection
                backoff_seconds = 2

                # Listen until connection closes or stop requested
                await self.listen()

                if self._stop:
                    break

                # Connection closed; attempt to reconnect after a short delay
                logger.info("Connection closed; reconnecting in 5 seconds...")
                await asyncio.sleep(5)

            except KeyboardInterrupt:
                logger.info("Shutting down WebSocket client")
                break
            except Exception as e:
                if self._stop:
                    break
                logger.error(f"Unexpected error: {e}")
                await asyncio.sleep(5)

        # Ensure we are disconnected when loop exits
        if self.websocket:
            await self.disconnect()