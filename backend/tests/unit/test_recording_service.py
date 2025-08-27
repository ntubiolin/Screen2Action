"""Unit tests for RecordingService."""

import pytest
import os
import json
import tempfile
from unittest.mock import MagicMock, patch, mock_open, AsyncMock
from datetime import datetime, timedelta
from app.services.recording_service import RecordingService


class TestRecordingService:
    """Test suite for RecordingService."""

    @pytest.fixture
    def recording_service(self):
        """Create RecordingService instance."""
        return RecordingService()

    def test_initialization(self, recording_service):
        """Test RecordingService initialization."""
        assert recording_service.recordings == {}
        assert recording_service.active_recordings == {}
        assert recording_service.recording_dir == "recordings"

    def test_start_recording(self, recording_service):
        """Test starting a recording."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(
                source_id="screen1",
                audio_mic=True,
                audio_system=True
            )
        
        assert session_id is not None
        assert session_id in recording_service.recordings
        assert session_id in recording_service.active_recordings
        assert recording_service.recordings[session_id]["status"] == "recording"
        assert recording_service.recordings[session_id]["source_id"] == "screen1"
        assert recording_service.recordings[session_id]["audio_mic"] is True
        assert recording_service.recordings[session_id]["audio_system"] is True

    def test_stop_recording(self, recording_service):
        """Test stopping a recording."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(source_id="screen1")
        
        with patch('os.path.exists', return_value=True):
            result = recording_service.stop_recording(session_id)
        
        assert result is True
        assert session_id not in recording_service.active_recordings
        assert recording_service.recordings[session_id]["status"] == "stopped"
        assert recording_service.recordings[session_id]["end_time"] is not None

    def test_stop_invalid_recording(self, recording_service):
        """Test stopping an invalid recording."""
        result = recording_service.stop_recording("invalid_id")
        assert result is False

    def test_pause_recording(self, recording_service):
        """Test pausing a recording."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(source_id="screen1")
        
        result = recording_service.pause_recording(session_id)
        
        assert result is True
        assert recording_service.recordings[session_id]["status"] == "paused"

    def test_resume_recording(self, recording_service):
        """Test resuming a paused recording."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(source_id="screen1")
        
        recording_service.pause_recording(session_id)
        result = recording_service.resume_recording(session_id)
        
        assert result is True
        assert recording_service.recordings[session_id]["status"] == "recording"

    def test_add_note_to_recording(self, recording_service):
        """Test adding a note to a recording."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(source_id="screen1")
        
        timestamp = 1234567890
        note_content = "Important moment in recording"
        
        result = recording_service.add_note(session_id, note_content, timestamp)
        
        assert result is True
        assert len(recording_service.recordings[session_id]["notes"]) == 1
        assert recording_service.recordings[session_id]["notes"][0]["content"] == note_content
        assert recording_service.recordings[session_id]["notes"][0]["timestamp"] == timestamp

    def test_add_note_to_invalid_recording(self, recording_service):
        """Test adding a note to an invalid recording."""
        result = recording_service.add_note("invalid_id", "note", 123)
        assert result is False

    def test_add_screenshot_to_recording(self, recording_service):
        """Test adding a screenshot to a recording."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(source_id="screen1")
        
        screenshot_path = "/path/to/screenshot.png"
        timestamp = 1234567890
        
        result = recording_service.add_screenshot(session_id, screenshot_path, timestamp)
        
        assert result is True
        assert len(recording_service.recordings[session_id]["screenshots"]) == 1
        assert recording_service.recordings[session_id]["screenshots"][0]["path"] == screenshot_path
        assert recording_service.recordings[session_id]["screenshots"][0]["timestamp"] == timestamp

    def test_get_recording_info(self, recording_service):
        """Test getting recording information."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(source_id="screen1")
        
        info = recording_service.get_recording_info(session_id)
        
        assert info is not None
        assert info["session_id"] == session_id
        assert info["status"] == "recording"
        assert info["source_id"] == "screen1"

    def test_get_invalid_recording_info(self, recording_service):
        """Test getting info for invalid recording."""
        info = recording_service.get_recording_info("invalid_id")
        assert info is None

    def test_list_recordings(self, recording_service):
        """Test listing all recordings."""
        with patch('os.makedirs'):
            session1 = recording_service.start_recording(source_id="screen1")
            session2 = recording_service.start_recording(source_id="screen2")
        
        recordings = recording_service.list_recordings()
        
        assert len(recordings) == 2
        assert any(r["session_id"] == session1 for r in recordings)
        assert any(r["session_id"] == session2 for r in recordings)

    def test_list_active_recordings(self, recording_service):
        """Test listing active recordings."""
        with patch('os.makedirs'):
            session1 = recording_service.start_recording(source_id="screen1")
            session2 = recording_service.start_recording(source_id="screen2")
            recording_service.stop_recording(session1)
        
        active = recording_service.list_active_recordings()
        
        assert len(active) == 1
        assert active[0]["session_id"] == session2

    def test_export_recording(self, recording_service):
        """Test exporting a recording."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(source_id="screen1")
            recording_service.add_note(session_id, "Test note", 123)
            recording_service.stop_recording(session_id)
        
        with patch('builtins.open', mock_open()) as mock_file:
            export_path = recording_service.export_recording(session_id, "/export/path")
        
        assert export_path is not None
        assert export_path.endswith(".json")
        
        # Verify data was written
        mock_file.assert_called()
        written_data = mock_file().write.call_args[0][0]
        parsed_data = json.loads(written_data)
        assert parsed_data["session_id"] == session_id

    def test_import_recording(self, recording_service):
        """Test importing a recording."""
        import_data = {
            "session_id": "imported_recording",
            "source_id": "screen1",
            "status": "stopped",
            "start_time": datetime.now().isoformat(),
            "end_time": (datetime.now() + timedelta(minutes=5)).isoformat(),
            "notes": [{"content": "Imported note", "timestamp": 123}],
            "screenshots": []
        }
        
        with patch('builtins.open', mock_open(read_data=json.dumps(import_data))):
            result = recording_service.import_recording("/import/path.json")
        
        assert result is True
        assert "imported_recording" in recording_service.recordings
        assert len(recording_service.recordings["imported_recording"]["notes"]) == 1

    def test_delete_recording(self, recording_service):
        """Test deleting a recording."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(source_id="screen1")
            recording_service.stop_recording(session_id)
        
        with patch('os.remove'):
            with patch('os.path.exists', return_value=True):
                result = recording_service.delete_recording(session_id)
        
        assert result is True
        assert session_id not in recording_service.recordings

    def test_delete_active_recording(self, recording_service):
        """Test deleting an active recording (should fail)."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(source_id="screen1")
        
        result = recording_service.delete_recording(session_id)
        
        assert result is False
        assert session_id in recording_service.recordings

    def test_get_recording_duration(self, recording_service):
        """Test getting recording duration."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(source_id="screen1")
        
        # Mock time passage
        start_time = datetime.now() - timedelta(minutes=5)
        recording_service.recordings[session_id]["start_time"] = start_time.isoformat()
        
        duration = recording_service.get_recording_duration(session_id)
        
        assert duration is not None
        assert duration >= 300  # At least 5 minutes in seconds

    def test_merge_recordings(self, recording_service):
        """Test merging multiple recordings."""
        with patch('os.makedirs'):
            session1 = recording_service.start_recording(source_id="screen1")
            recording_service.add_note(session1, "Note 1", 100)
            recording_service.stop_recording(session1)
            
            session2 = recording_service.start_recording(source_id="screen1")
            recording_service.add_note(session2, "Note 2", 200)
            recording_service.stop_recording(session2)
        
        merged_id = recording_service.merge_recordings([session1, session2])
        
        assert merged_id in recording_service.recordings
        assert len(recording_service.recordings[merged_id]["notes"]) == 2
        assert recording_service.recordings[merged_id]["status"] == "merged"

    def test_cleanup_old_recordings(self, recording_service):
        """Test cleaning up old recordings."""
        with patch('os.makedirs'):
            # Create old recording
            old_session = recording_service.start_recording(source_id="screen1")
            recording_service.recordings[old_session]["start_time"] = \
                (datetime.now() - timedelta(days=40)).isoformat()
            recording_service.stop_recording(old_session)
            
            # Create recent recording
            recent_session = recording_service.start_recording(source_id="screen2")
            recording_service.stop_recording(recent_session)
        
        with patch('os.remove'):
            with patch('os.path.exists', return_value=True):
                cleaned = recording_service.cleanup_old_recordings(days=30)
        
        assert cleaned == 1
        assert old_session not in recording_service.recordings
        assert recent_session in recording_service.recordings

    @pytest.mark.asyncio
    async def test_process_recording_async(self, recording_service):
        """Test async recording processing."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(source_id="screen1")
            recording_service.stop_recording(session_id)
        
        async def mock_processor(recording_data):
            return {"processed": True, "frames": 1000}
        
        result = await recording_service.process_recording_async(
            session_id,
            processor=mock_processor
        )
        
        assert result["processed"] is True
        assert result["frames"] == 1000

    def test_update_recording_metadata(self, recording_service):
        """Test updating recording metadata."""
        with patch('os.makedirs'):
            session_id = recording_service.start_recording(source_id="screen1")
        
        metadata = {
            "title": "Test Recording",
            "description": "This is a test recording",
            "tags": ["test", "demo"]
        }
        
        result = recording_service.update_metadata(session_id, metadata)
        
        assert result is True
        assert recording_service.recordings[session_id]["metadata"]["title"] == "Test Recording"
        assert "test" in recording_service.recordings[session_id]["metadata"]["tags"]

    def test_search_recordings(self, recording_service):
        """Test searching recordings by criteria."""
        with patch('os.makedirs'):
            session1 = recording_service.start_recording(source_id="screen1")
            recording_service.update_metadata(session1, {"title": "Python Tutorial"})
            recording_service.stop_recording(session1)
            
            session2 = recording_service.start_recording(source_id="screen2")
            recording_service.update_metadata(session2, {"title": "JavaScript Guide"})
            recording_service.stop_recording(session2)
        
        # Search by title
        results = recording_service.search_recordings(title_contains="Python")
        
        assert len(results) == 1
        assert results[0]["session_id"] == session1

    def test_recording_statistics(self, recording_service):
        """Test getting recording statistics."""
        with patch('os.makedirs'):
            for i in range(3):
                session_id = recording_service.start_recording(source_id=f"screen{i}")
                for j in range(i + 1):
                    recording_service.add_note(session_id, f"Note {j}", j * 100)
                recording_service.stop_recording(session_id)
        
        stats = recording_service.get_statistics()
        
        assert stats["total_recordings"] == 3
        assert stats["total_notes"] == 6  # 1 + 2 + 3
        assert stats["active_recordings"] == 0