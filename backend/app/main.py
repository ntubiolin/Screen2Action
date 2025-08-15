import asyncio
import json
import logging
from pathlib import Path
from typing import Dict, Any

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.services.recording_service import RecordingService
from app.services.screenshot_service import ScreenshotService
from app.services.llm_service import LLMService
from app.services.mcp_service import MCPService
from app.websocket_client import WebSocketClient
from app.models.messages import Message, MessageType

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="Screen2Action Backend")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
recording_service = RecordingService()
screenshot_service = ScreenshotService()
llm_service = LLMService()
mcp_service = MCPService()

# WebSocket client to connect to Electron
electron_client = WebSocketClient("ws://localhost:8765")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def send_message(self, websocket: WebSocket, message: Dict[str, Any]):
        await websocket.send_json(message)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

@app.on_event("startup")
async def startup_event():
    """Connect to Electron WebSocket server on startup"""
    async def handle_electron_message(data):
        """Handle messages from Electron"""
        try:
            # Log received message for debugging
            logger.info(f"Received message from Electron: {data}")
            
            # Handle the message based on action
            if data.get('action') == 'start_recording':
                result = await recording_service.start_recording(data.get('payload', {}))
                await electron_client.send_response(data['id'], {"success": True, "session_id": result})
            elif data.get('action') == 'stop_recording':
                result = await recording_service.stop_recording()
                await electron_client.send_response(data['id'], {"success": True, "result": result})
            elif data.get('action') == 'get_mcp_servers':
                servers = await mcp_service.get_mcp_servers()
                await electron_client.send_response(data['id'], {"success": True, "servers": servers})
            elif data.get('action') == 'activate_mcp_server':
                server_name = data.get('payload', {}).get('server_name')
                success = await mcp_service.activate_mcp_server(server_name)
                await electron_client.send_response(data['id'], {"success": success})
            elif data.get('action') == 'deactivate_mcp_server':
                await mcp_service.deactivate_mcp_server()
                await electron_client.send_response(data['id'], {"success": True})
            elif data.get('action') == 'list_mcp_tools':
                tools = await mcp_service.list_mcp_tools()
                await electron_client.send_response(data['id'], {"success": True, "tools": tools})
            elif data.get('action') == 'execute_mcp_tool':
                result = await mcp_service.execute_mcp_tool(
                    data.get('payload', {}).get('tool_name'),
                    data.get('payload', {}).get('params', {})
                )
                await electron_client.send_response(data['id'], {"success": True, "result": result})
            elif data.get('action') == 'run_intelligent_task':
                result = await mcp_service.run_intelligent_task(
                    data.get('payload', {}).get('task'),
                    data.get('payload', {}).get('context', {})
                )
                await electron_client.send_response(data['id'], {"success": True, "result": result})
            elif data.get('action') == 'process_command':
                # Handle AI commands
                message = Message(**data)
                response = await process_message(message)
                if response:
                    await electron_client.send_response(message.id, response.dict().get('payload', response.dict()))
            else:
                logger.warning(f"Unknown action: {data.get('action')}")
                if 'id' in data:
                    await electron_client.send_response(data['id'], {
                        "success": False,
                        "error": f"Unknown action: {data.get('action')}"
                    })
        except Exception as e:
            logger.error(f"Error handling Electron message: {e}")
            if 'id' in data:
                await electron_client.send_response(data['id'], {
                    "success": False,
                    "error": str(e)
                })
    
    electron_client.set_message_handler(handle_electron_message)
    asyncio.create_task(electron_client.run())
    logger.info("Started WebSocket client connection to Electron")

@app.on_event("shutdown")
async def shutdown_event():
    """Disconnect from Electron WebSocket server on shutdown"""
    await electron_client.disconnect()
    logger.info("Disconnected from Electron WebSocket server")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Receive message from Electron frontend
            data = await websocket.receive_json()
            message = Message(**data)
            
            logger.info(f"Received message: {message.action}")
            
            # Process message based on action
            response = await process_message(message)
            
            # Send response back
            await manager.send_message(websocket, response.dict())
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

async def process_message(message: Message) -> Message:
    """Process incoming messages and route to appropriate service"""
    try:
        if message.action == "start_recording":
            result = await recording_service.start_recording(message.payload)
            return Message(
                id=message.id,
                type=MessageType.RESPONSE,
                action=message.action,
                payload={"success": True, "session_id": result}
            )
            
        elif message.action == "stop_recording":
            result = await recording_service.stop_recording()
            return Message(
                id=message.id,
                type=MessageType.RESPONSE,
                action=message.action,
                payload={"success": True, "result": result}
            )
            
        elif message.action == "capture_screenshot":
            result = await screenshot_service.capture(message.payload)
            return Message(
                id=message.id,
                type=MessageType.RESPONSE,
                action=message.action,
                payload={"success": True, "screenshot_id": result}
            )
            
        elif message.action == "process_command":
            # Process AI command
            command_type = message.payload.get("type")
            
            if command_type == "screenshot_command":
                result = await screenshot_service.process_command(
                    message.payload.get("screenshotId"),
                    message.payload.get("command")
                )
            elif command_type == "note_enhancement":
                result = await llm_service.enhance_note(
                    message.payload.get("prompt"),
                    message.payload.get("context")
                )
            else:
                result = await llm_service.process_general(message.payload)
            
            return Message(
                id=message.id,
                type=MessageType.RESPONSE,
                action=message.action,
                payload=result
            )
            
        elif message.action == "mcp_tool_call":
            result = await mcp_service.execute_tool(
                message.payload.get("tool"),
                message.payload.get("params")
            )
            return Message(
                id=message.id,
                type=MessageType.RESPONSE,
                action=message.action,
                payload={"success": True, "result": result}
            )
        
        elif message.action == "get_mcp_servers":
            servers = await mcp_service.get_mcp_servers()
            return Message(
                id=message.id,
                type=MessageType.RESPONSE,
                action=message.action,
                payload={"success": True, "servers": servers}
            )
        
        elif message.action == "activate_mcp_server":
            server_name = message.payload.get("server_name")
            success = await mcp_service.activate_mcp_server(server_name)
            return Message(
                id=message.id,
                type=MessageType.RESPONSE,
                action=message.action,
                payload={"success": success}
            )
        
        elif message.action == "deactivate_mcp_server":
            await mcp_service.deactivate_mcp_server()
            return Message(
                id=message.id,
                type=MessageType.RESPONSE,
                action=message.action,
                payload={"success": True}
            )
        
        elif message.action == "list_mcp_tools":
            tools = await mcp_service.list_mcp_tools()
            return Message(
                id=message.id,
                type=MessageType.RESPONSE,
                action=message.action,
                payload={"success": True, "tools": tools}
            )
        
        elif message.action == "execute_mcp_tool":
            result = await mcp_service.execute_mcp_tool(
                message.payload.get("tool_name"),
                message.payload.get("params", {})
            )
            return Message(
                id=message.id,
                type=MessageType.RESPONSE,
                action=message.action,
                payload={"success": True, "result": result}
            )
        
        elif message.action == "run_intelligent_task":
            result = await mcp_service.run_intelligent_task(
                message.payload.get("task"),
                message.payload.get("context", {})
            )
            return Message(
                id=message.id,
                type=MessageType.RESPONSE,
                action=message.action,
                payload={"success": True, "result": result}
            )
            
        elif message.action == "list_audio_devices":
            devices = recording_service.list_audio_devices()
            return Message(id=message.id, type=MessageType.RESPONSE, action=message.action, payload={"success": True, "devices": devices})
        elif message.action == "select_audio_devices":
            mic = message.payload.get('mic')
            system = message.payload.get('system')
            recording_service.set_preferred_devices(mic, system)
            return Message(id=message.id, type=MessageType.RESPONSE, action=message.action, payload={"success": True})
            
        else:
            return Message(
                id=message.id,
                type=MessageType.RESPONSE,
                action=message.action,
                payload={"success": False, "error": f"Unknown action: {message.action}"}
            )
            
    except Exception as e:
        logger.error(f"Error processing message: {e}")
        return Message(
            id=message.id,
            type=MessageType.RESPONSE,
            action=message.action,
            payload={"success": False, "error": str(e)}
        )

@app.get("/health")
async def health_check():
    return {"status": "healthy", "services": {
        "recording": recording_service.is_healthy(),
        "screenshot": screenshot_service.is_healthy(),
        "llm": llm_service.is_healthy(),
        "mcp": mcp_service.is_healthy()
    }}

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8766,
        reload=True,
        log_level="info"
    )