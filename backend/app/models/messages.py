from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class MessageType(str, Enum):
    REQUEST = "request"
    RESPONSE = "response"
    EVENT = "event"

class Message(BaseModel):
    id: Optional[str] = Field(default=None)
    type: MessageType
    action: str
    payload: Any
    timestamp: Optional[int] = Field(default_factory=lambda: int(datetime.now().timestamp() * 1000))

class RecordingSession(BaseModel):
    id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    screen_id: str
    notes: list = Field(default_factory=list)
    screenshots: list = Field(default_factory=list)
    audio_files: dict = Field(default_factory=dict)

class Screenshot(BaseModel):
    id: str
    timestamp: datetime
    path: str
    thumbnail_path: Optional[str] = None
    annotations: list = Field(default_factory=list)
    ocr_text: Optional[str] = None

class Note(BaseModel):
    id: str
    content: str
    start_time: int  # milliseconds from recording start
    end_time: int
    screenshots: list = Field(default_factory=list)
    audio_segment: Optional[dict] = None