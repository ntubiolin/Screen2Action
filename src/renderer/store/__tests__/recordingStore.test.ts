import { renderHook, act } from '@testing-library/react';
import { useRecordingStore } from '../recordingStore';

describe('RecordingStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useRecordingStore());
    act(() => {
      result.current.clearNotes();
      result.current.setSessionId(null);
      result.current.setRecording(false);
      result.current.setRecordingStartTime(null);
      result.current.setRecordingDuration(null);
      result.current.setAudioDevices([]);
      result.current.setSelectedMic(null);
      result.current.setSelectedSystem(null);
    });
  });

  describe('Notes Management', () => {
    it('should add a note', () => {
      const { result } = renderHook(() => useRecordingStore());
      const newNote = {
        content: 'Test note',
        timestamp: Date.now(),
        screenshots: ['screenshot1.png'],
      };

      act(() => {
        result.current.addNote(newNote);
      });

      expect(result.current.notes).toHaveLength(1);
      expect(result.current.notes[0]).toEqual(newNote);
    });

    it('should update a note', () => {
      const { result } = renderHook(() => useRecordingStore());
      const originalNote = {
        content: 'Original note',
        timestamp: Date.now(),
      };

      act(() => {
        result.current.addNote(originalNote);
        result.current.updateNote(0, { content: 'Updated note' });
      });

      expect(result.current.notes[0].content).toBe('Updated note');
      expect(result.current.notes[0].timestamp).toBe(originalNote.timestamp);
    });

    it('should delete a note', () => {
      const { result } = renderHook(() => useRecordingStore());

      act(() => {
        result.current.addNote({ content: 'Note 1', timestamp: 1 });
        result.current.addNote({ content: 'Note 2', timestamp: 2 });
        result.current.addNote({ content: 'Note 3', timestamp: 3 });
        result.current.deleteNote(1);
      });

      expect(result.current.notes).toHaveLength(2);
      expect(result.current.notes[0].content).toBe('Note 1');
      expect(result.current.notes[1].content).toBe('Note 3');
    });

    it('should clear all notes', () => {
      const { result } = renderHook(() => useRecordingStore());

      act(() => {
        result.current.addNote({ content: 'Note 1', timestamp: 1 });
        result.current.addNote({ content: 'Note 2', timestamp: 2 });
        result.current.clearNotes();
      });

      expect(result.current.notes).toHaveLength(0);
    });

    it('should handle notes with audio segments', () => {
      const { result } = renderHook(() => useRecordingStore());
      const noteWithAudio = {
        content: 'Note with audio',
        timestamp: Date.now(),
        audioSegment: {
          start: 1000,
          end: 5000,
        },
      };

      act(() => {
        result.current.addNote(noteWithAudio);
      });

      expect(result.current.notes[0].audioSegment).toEqual({
        start: 1000,
        end: 5000,
      });
    });
  });

  describe('Recording State Management', () => {
    it('should set recording state', () => {
      const { result } = renderHook(() => useRecordingStore());

      act(() => {
        result.current.setRecording(true);
      });

      expect(result.current.isRecording).toBe(true);

      act(() => {
        result.current.setRecording(false);
      });

      expect(result.current.isRecording).toBe(false);
    });

    it('should set session ID', () => {
      const { result } = renderHook(() => useRecordingStore());
      const sessionId = 'test-session-123';

      act(() => {
        result.current.setSessionId(sessionId);
      });

      expect(result.current.currentSessionId).toBe(sessionId);
    });

    it('should set recording start time', () => {
      const { result } = renderHook(() => useRecordingStore());
      const startTime = Date.now();

      act(() => {
        result.current.setRecordingStartTime(startTime);
      });

      expect(result.current.recordingStartTime).toBe(startTime);
    });

    it('should set recording duration', () => {
      const { result } = renderHook(() => useRecordingStore());
      const duration = 12345;

      act(() => {
        result.current.setRecordingDuration(duration);
      });

      expect(result.current.recordingDuration).toBe(duration);
    });
  });

  describe('Audio Device Management', () => {
    it('should set audio devices list', () => {
      const { result } = renderHook(() => useRecordingStore());
      const devices = [
        { id: 'mic1', name: 'Microphone 1' },
        { id: 'mic2', name: 'Microphone 2' },
      ];

      act(() => {
        result.current.setAudioDevices(devices);
      });

      expect(result.current.audioDevices).toEqual(devices);
    });

    it('should set selected microphone', () => {
      const { result } = renderHook(() => useRecordingStore());
      const micId = 'mic-123';

      act(() => {
        result.current.setSelectedMic(micId);
      });

      expect(result.current.selectedMic).toBe(micId);
    });

    it('should set selected system audio', () => {
      const { result } = renderHook(() => useRecordingStore());
      const systemId = 'system-audio-123';

      act(() => {
        result.current.setSelectedSystem(systemId);
      });

      expect(result.current.selectedSystem).toBe(systemId);
    });

    it('should handle null audio device selections', () => {
      const { result } = renderHook(() => useRecordingStore());

      act(() => {
        result.current.setSelectedMic('mic-123');
        result.current.setSelectedSystem('system-123');
        result.current.setSelectedMic(null);
        result.current.setSelectedSystem(null);
      });

      expect(result.current.selectedMic).toBeNull();
      expect(result.current.selectedSystem).toBeNull();
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle a complete recording session flow', () => {
      const { result } = renderHook(() => useRecordingStore());
      const sessionId = 'session-456';
      const startTime = Date.now();

      // Start recording
      act(() => {
        result.current.setSessionId(sessionId);
        result.current.setRecordingStartTime(startTime);
        result.current.setRecording(true);
      });

      // Add notes during recording
      act(() => {
        result.current.addNote({
          content: 'First observation',
          timestamp: startTime + 5000,
        });
        result.current.addNote({
          content: 'Second observation',
          timestamp: startTime + 10000,
          screenshots: ['screen1.png', 'screen2.png'],
        });
      });

      expect(result.current.notes).toHaveLength(2);
      expect(result.current.isRecording).toBe(true);

      // Stop recording
      const duration = 15000;
      act(() => {
        result.current.setRecording(false);
        result.current.setRecordingDuration(duration);
      });

      expect(result.current.isRecording).toBe(false);
      expect(result.current.recordingDuration).toBe(duration);
      expect(result.current.currentSessionId).toBe(sessionId);
    });

    it('should maintain state consistency when clearing session', () => {
      const { result } = renderHook(() => useRecordingStore());

      // Set up a complete session
      act(() => {
        result.current.setSessionId('session-789');
        result.current.setRecordingStartTime(Date.now());
        result.current.setRecording(true);
        result.current.addNote({ content: 'Test note', timestamp: Date.now() });
        result.current.setAudioDevices([{ id: 'mic1', name: 'Mic 1' }]);
        result.current.setSelectedMic('mic1');
      });

      // Clear session
      act(() => {
        result.current.clearNotes();
        result.current.setSessionId(null);
        result.current.setRecording(false);
        result.current.setRecordingStartTime(null);
        result.current.setRecordingDuration(null);
      });

      expect(result.current.notes).toHaveLength(0);
      expect(result.current.currentSessionId).toBeNull();
      expect(result.current.isRecording).toBe(false);
      expect(result.current.recordingStartTime).toBeNull();
      expect(result.current.recordingDuration).toBeNull();
      // Audio devices should persist
      expect(result.current.audioDevices).toHaveLength(1);
      expect(result.current.selectedMic).toBe('mic1');
    });
  });
});