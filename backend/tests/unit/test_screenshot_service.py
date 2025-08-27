"""Unit tests for ScreenshotService."""

import pytest
import os
import json
import base64
from unittest.mock import MagicMock, patch, mock_open, AsyncMock
from datetime import datetime
try:
    from app.services.screenshot_service import ScreenshotService
except ImportError:
    ScreenshotService = None


class TestScreenshotService:
    """Test suite for ScreenshotService."""

    @pytest.fixture
    def screenshot_service(self):
        """Create ScreenshotService instance."""
        if ScreenshotService is None:
            pytest.skip("ScreenshotService not available")
        with patch('app.services.screenshot_service.Path.mkdir'):
            return ScreenshotService()

    def test_initialization(self):
        """Test ScreenshotService initialization."""
        if ScreenshotService is None:
            pytest.skip("ScreenshotService not available")
        with patch('app.services.screenshot_service.Path.mkdir'):
            service = ScreenshotService()
            assert service.screenshots_dir.name == "screenshots"
            assert service.screenshots_cache == {}
            assert service.websocket_client is None

    def test_create_session(self, screenshot_service):
        """Test creating a new session."""
        session_id = screenshot_service.create_session()
        
        assert session_id is not None
        assert session_id in screenshot_service.sessions
        assert screenshot_service.sessions[session_id]["screenshot_count"] == 0
        assert "screenshots" in screenshot_service.sessions[session_id]
        assert isinstance(screenshot_service.sessions[session_id]["screenshots"], list)

    def test_add_screenshot(self, screenshot_service):
        """Test adding a screenshot to a session."""
        session_id = screenshot_service.create_session()
        
        # Mock base64 image data
        image_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        
        with patch('builtins.open', mock_open()):
            with patch('os.makedirs'):
                screenshot_path = screenshot_service.add_screenshot(session_id, image_data)
        
        assert screenshot_path is not None
        assert screenshot_path.endswith(".png")
        assert screenshot_service.sessions[session_id]["screenshot_count"] == 1
        assert len(screenshot_service.sessions[session_id]["screenshots"]) == 1

    def test_add_screenshot_invalid_session(self, screenshot_service):
        """Test adding screenshot to invalid session."""
        image_data = "data:image/png;base64,test"
        
        screenshot_path = screenshot_service.add_screenshot("invalid_id", image_data)
        
        assert screenshot_path is None

    def test_add_screenshot_no_base64_prefix(self, screenshot_service):
        """Test adding screenshot without base64 prefix."""
        session_id = screenshot_service.create_session()
        
        # Image data without data URL prefix
        image_data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        
        with patch('builtins.open', mock_open()):
            with patch('os.makedirs'):
                screenshot_path = screenshot_service.add_screenshot(session_id, image_data)
        
        assert screenshot_path is not None
        assert screenshot_service.sessions[session_id]["screenshot_count"] == 1

    def test_add_screenshot_with_metadata(self, screenshot_service):
        """Test adding screenshot with metadata."""
        session_id = screenshot_service.create_session()
        
        image_data = "data:image/png;base64,test"
        metadata = {
            "timestamp": datetime.now().isoformat(),
            "source": "screen",
            "resolution": "1920x1080"
        }
        
        with patch('builtins.open', mock_open()):
            with patch('os.makedirs'):
                screenshot_path = screenshot_service.add_screenshot(
                    session_id, 
                    image_data,
                    metadata=metadata
                )
        
        assert screenshot_path is not None
        screenshot_info = screenshot_service.sessions[session_id]["screenshots"][0]
        assert screenshot_info["metadata"] == metadata

    def test_get_session_screenshots(self, screenshot_service):
        """Test getting screenshots for a session."""
        session_id = screenshot_service.create_session()
        
        # Add multiple screenshots
        with patch('builtins.open', mock_open()):
            with patch('os.makedirs'):
                for i in range(3):
                    screenshot_service.add_screenshot(session_id, f"data:image/png;base64,test{i}")
        
        screenshots = screenshot_service.get_session_screenshots(session_id)
        
        assert len(screenshots) == 3
        assert all("path" in s for s in screenshots)
        assert all("timestamp" in s for s in screenshots)

    def test_get_session_screenshots_invalid(self, screenshot_service):
        """Test getting screenshots for invalid session."""
        screenshots = screenshot_service.get_session_screenshots("invalid_id")
        
        assert screenshots == []

    def test_delete_session(self, screenshot_service):
        """Test deleting a session."""
        session_id = screenshot_service.create_session()
        
        # Add screenshots
        with patch('builtins.open', mock_open()):
            with patch('os.makedirs'):
                screenshot_service.add_screenshot(session_id, "data:image/png;base64,test")
        
        # Delete session
        with patch('os.remove'):
            with patch('os.path.exists', return_value=True):
                result = screenshot_service.delete_session(session_id)
        
        assert result is True
        assert session_id not in screenshot_service.sessions

    def test_delete_invalid_session(self, screenshot_service):
        """Test deleting an invalid session."""
        result = screenshot_service.delete_session("invalid_id")
        
        assert result is False

    def test_export_session(self, screenshot_service):
        """Test exporting a session."""
        session_id = screenshot_service.create_session()
        
        # Add screenshots and metadata
        with patch('builtins.open', mock_open()):
            with patch('os.makedirs'):
                screenshot_service.add_screenshot(
                    session_id,
                    "data:image/png;base64,test",
                    metadata={"note": "Test screenshot"}
                )
        
        # Export session
        with patch('builtins.open', mock_open()) as mock_file:
            export_path = screenshot_service.export_session(session_id, "/export/path")
        
        assert export_path is not None
        assert export_path.endswith(".json")
        
        # Verify JSON was written
        mock_file.assert_called()
        written_data = mock_file().write.call_args[0][0]
        parsed_data = json.loads(written_data)
        assert parsed_data["session_id"] == session_id
        assert len(parsed_data["screenshots"]) == 1

    def test_export_invalid_session(self, screenshot_service):
        """Test exporting an invalid session."""
        export_path = screenshot_service.export_session("invalid_id", "/export/path")
        
        assert export_path is None

    def test_import_session(self, screenshot_service):
        """Test importing a session."""
        import_data = {
            "session_id": "imported_session",
            "created_at": datetime.now().isoformat(),
            "screenshots": [
                {
                    "path": "/path/to/screenshot.png",
                    "timestamp": datetime.now().isoformat(),
                    "metadata": {"note": "Imported screenshot"}
                }
            ],
            "screenshot_count": 1
        }
        
        with patch('builtins.open', mock_open(read_data=json.dumps(import_data))):
            result = screenshot_service.import_session("/import/path.json")
        
        assert result is True
        assert "imported_session" in screenshot_service.sessions
        assert screenshot_service.sessions["imported_session"]["screenshot_count"] == 1

    def test_import_invalid_file(self, screenshot_service):
        """Test importing from invalid file."""
        with patch('builtins.open', side_effect=FileNotFoundError()):
            result = screenshot_service.import_session("/invalid/path.json")
        
        assert result is False

    def test_import_invalid_json(self, screenshot_service):
        """Test importing invalid JSON."""
        with patch('builtins.open', mock_open(read_data="invalid json")):
            result = screenshot_service.import_session("/import/path.json")
        
        assert result is False

    def test_cleanup_old_sessions(self, screenshot_service):
        """Test cleaning up old sessions."""
        # Create sessions with different timestamps
        old_session = screenshot_service.create_session()
        screenshot_service.sessions[old_session]["created_at"] = "2020-01-01T00:00:00"
        
        recent_session = screenshot_service.create_session()
        screenshot_service.sessions[recent_session]["created_at"] = datetime.now().isoformat()
        
        with patch('os.remove'):
            with patch('os.path.exists', return_value=True):
                cleaned = screenshot_service.cleanup_old_sessions(days=30)
        
        assert cleaned == 1
        assert old_session not in screenshot_service.sessions
        assert recent_session in screenshot_service.sessions

    @pytest.mark.asyncio
    async def test_process_screenshot_async(self, screenshot_service):
        """Test async screenshot processing."""
        session_id = screenshot_service.create_session()
        image_data = "data:image/png;base64,test"
        
        # Mock async processing
        async def mock_process(data):
            return {"processed": True, "data": data}
        
        with patch('builtins.open', mock_open()):
            with patch('os.makedirs'):
                result = await screenshot_service.process_screenshot_async(
                    session_id,
                    image_data,
                    processor=mock_process
                )
        
        assert result["processed"] is True
        assert screenshot_service.sessions[session_id]["screenshot_count"] == 1

    def test_get_screenshot_stats(self, screenshot_service):
        """Test getting screenshot statistics."""
        # Create sessions with screenshots
        for i in range(2):
            session_id = screenshot_service.create_session()
            with patch('builtins.open', mock_open()):
                with patch('os.makedirs'):
                    for j in range(3):
                        screenshot_service.add_screenshot(session_id, f"data:image/png;base64,test{j}")
        
        stats = screenshot_service.get_screenshot_stats()
        
        assert stats["total_sessions"] == 2
        assert stats["total_screenshots"] == 6
        assert stats["average_screenshots_per_session"] == 3

    def test_merge_sessions(self, screenshot_service):
        """Test merging multiple sessions."""
        # Create sessions
        session1 = screenshot_service.create_session()
        session2 = screenshot_service.create_session()
        
        with patch('builtins.open', mock_open()):
            with patch('os.makedirs'):
                screenshot_service.add_screenshot(session1, "data:image/png;base64,test1")
                screenshot_service.add_screenshot(session2, "data:image/png;base64,test2")
        
        # Merge sessions
        merged_id = screenshot_service.merge_sessions([session1, session2])
        
        assert merged_id in screenshot_service.sessions
        assert screenshot_service.sessions[merged_id]["screenshot_count"] == 2
        assert len(screenshot_service.sessions[merged_id]["screenshots"]) == 2

    def test_add_screenshot_with_ocr(self, screenshot_service):
        """Test adding screenshot with OCR text."""
        session_id = screenshot_service.create_session()
        image_data = "data:image/png;base64,test"
        ocr_text = "This is extracted text from the screenshot"
        
        with patch('builtins.open', mock_open()):
            with patch('os.makedirs'):
                screenshot_path = screenshot_service.add_screenshot(
                    session_id,
                    image_data,
                    ocr_text=ocr_text
                )
        
        screenshot_info = screenshot_service.sessions[session_id]["screenshots"][0]
        assert screenshot_info["ocr_text"] == ocr_text

    def test_search_screenshots_by_text(self, screenshot_service):
        """Test searching screenshots by OCR text."""
        session_id = screenshot_service.create_session()
        
        with patch('builtins.open', mock_open()):
            with patch('os.makedirs'):
                screenshot_service.add_screenshot(
                    session_id, "data:image/png;base64,test1",
                    ocr_text="Hello world"
                )
                screenshot_service.add_screenshot(
                    session_id, "data:image/png;base64,test2",
                    ocr_text="Python programming"
                )
        
        # Search for screenshots
        results = screenshot_service.search_screenshots(session_id, "world")
        
        assert len(results) == 1
        assert "Hello world" in results[0]["ocr_text"]