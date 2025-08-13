import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useRecordingStore } from '../store/recordingStore';

interface RecordingPageProps {
  onRecordingComplete: (sessionId: string) => void;
}

export const RecordingPage: React.FC<RecordingPageProps> = ({ onRecordingComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [selectedScreen, setSelectedScreen] = useState<string>('');
  const [sources, setSources] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [outputPath, setOutputPath] = useState<string>('');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [conversionMessage, setConversionMessage] = useState<string>('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  
  const { addNote, clearNotes, audioDevices, setAudioDevices, selectedMic, selectedSystem, setSelectedMic, setSelectedSystem, setRecordingDuration } = useRecordingStore();

  useEffect(() => {
    loadSources();
  }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecordingTime(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  useEffect(() => {
    const handler = (data: any) => {
      if (data.error) {
        setConversionMessage(`Audio conversion failed`);
      } else {
        setConversionMessage(`Audio converted: ${data.converted}/${data.total}`);
      }
      setTimeout(() => setConversionMessage(''), 8000);
    };
    window.electronAPI.on('audio-conversion-complete', handler);
    return () => {
      window.electronAPI.removeListener('audio-conversion-complete', handler);
    };
  }, []);

  const loadSources = async () => {
    try {
      const desktopSources = await window.electronAPI.sources.getDesktopSources();
      setSources(desktopSources);
      if (desktopSources.length > 0) {
        setSelectedScreen(desktopSources[0].id);
      }
    } catch (error) {
      console.error('Failed to load sources:', error);
    }
  };

  const startRecording = async () => {
    if (!selectedScreen) {
      alert('Please select a screen to record');
      return;
    }

    try {
      // Request microphone permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Stop the test stream
        setAudioEnabled(true);
        console.log('Microphone access granted');
      } catch (audioError) {
        console.warn('Microphone access denied or unavailable:', audioError);
        setAudioEnabled(false);
        // Continue without audio
      }

      // Send preferred device patterns before starting
      if (selectedMic || selectedSystem) {
        try {
          await window.electronAPI.ai.sendCommand({ type: 'list_audio_devices_debug' });
          await window.electronAPI.ai.sendCommand({ action: 'select_audio_devices', mic: selectedMic, system: selectedSystem });
        } catch (e) { console.warn('Failed to send preferred devices', e); }
      }

      const sessionId = await window.electronAPI.recording.start(selectedScreen);
      sessionIdRef.current = sessionId;
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
      clearNotes();
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to start recording');
    }
  };

  const stopRecording = async () => {
    try {
      const stopResult = await window.electronAPI.recording.stop();
      setIsRecording(false);
      setAudioEnabled(false);
      if (stopResult?.duration) {
        setRecordingDuration(stopResult.duration);
      }
      
      if (sessionIdRef.current) {
        // Save markdown notes to file
        if (notes.trim()) {
          try {
            await window.electronAPI.file.saveMarkdown(sessionIdRef.current, notes);
            console.log('Markdown notes saved successfully');
          } catch (error) {
            console.error('Failed to save markdown notes:', error);
          }
        }
        
        // Parse notes with timestamps from markdown
        // New logic: split notes into sections using Markdown H1 headings (lines starting with "# ")
        const rawLines = notes.split('\n');
        const sections: string[] = [];
        let currentSection: string[] = [];
        for (const line of rawLines) {
          if (line.startsWith('# ')) {
            if (currentSection.length) {
              sections.push(currentSection.join('\n').trim());
            }
            currentSection = [line];
          } else {
            // Only accumulate lines after the first H1 appears
            if (currentSection.length) {
              currentSection.push(line);
            }
          }
        }
        if (currentSection.length) {
          sections.push(currentSection.join('\n').trim());
        }

        // Fallback: if no H1 headings were found, revert to previous line-based splitting
        const noteEntries = sections.length > 0
          ? sections
          : rawLines.filter(line => line.trim());

        noteEntries.forEach((entry, index) => {
          // Try to extract timestamp from formats like:
          //   [00:30] Some content
          //   # [00:30] Heading title
          const timestampMatch = entry.match(/^#?\s*\[(\d{2}):(\d{2})\]\s*([\s\S]*)/);
          let timestamp: number;
          let content: string = entry;

            if (timestampMatch) {
            const minutes = parseInt(timestampMatch[1]);
            const seconds = parseInt(timestampMatch[2]);
            timestamp = (minutes * 60 + seconds) * 1000;
            // Remove just the leading [MM:SS] (and any extra spaces) while preserving a leading '# ' if present
            content = entry
              .replace(/^(#?)(\s*)\[(\d{2}):(\d{2})\]\s*/, (_m, hash) => hash ? '# ' : '')
              .trim();
          } else {
            // Distribute timestamps evenly across total recording time as before
            const recordingDuration = Date.now() - recordingStartTimeRef.current;
            timestamp = Math.floor((index / Math.max(noteEntries.length - 1, 1)) * recordingDuration);
          }

          addNote({
            content,
            timestamp,
          });
        });
        
        onRecordingComplete(sessionIdRef.current);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      alert('Failed to stop recording');
    }
  };
  
  const selectOutputPath = async () => {
    try {
      const path = await window.electronAPI.file.selectOutputPath();
      if (path) {
        setOutputPath(path);
        console.log('Output path selected:', path);
      }
    } catch (error) {
      console.error('Failed to select output path:', error);
    }
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full">
      {conversionMessage && (
        <div className="mb-2 px-4 py-2 rounded bg-gray-700 text-sm text-gray-200 shadow inline-flex items-center space-x-2">
          <span>🎵</span>
          <span>{conversionMessage}</span>
        </div>
      )}
      <div className="bg-gray-800 p-4 rounded-lg mb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <select
              value={selectedScreen}
              onChange={(e) => setSelectedScreen(e.target.value)}
              disabled={isRecording}
              className="bg-gray-700 text-white px-4 py-2 rounded"
            >
              <option value="">Select Screen</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>

            {!isRecording ? (
              <button
                onClick={startRecording}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded flex items-center space-x-2"
              >
                <span className="w-3 h-3 bg-white rounded-full"></span>
                <span>Start Recording</span>
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded flex items-center space-x-2"
              >
                <span className="w-3 h-3 bg-white rounded-sm"></span>
                <span>Stop Recording</span>
              </button>
            )}
            
            <button
              onClick={selectOutputPath}
              disabled={isRecording}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded flex items-center space-x-2"
            >
              <span>📁</span>
              <span>Output Path</span>
            </button>
            
            {outputPath && (
              <span className="text-sm text-gray-400 truncate max-w-xs" title={outputPath}>
                {outputPath}
              </span>
            )}
          </div>

          {isRecording && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                <span className="text-xl font-mono">{formatTime(recordingTime)}</span>
              </div>
              {audioEnabled && (
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-green-400">Audio Recording</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Mic Pattern (substring)</label>
            <input value={selectedMic || ''} onChange={(e)=> setSelectedMic(e.target.value || null)} placeholder="e.g. USB" className="w-full bg-gray-700 text-white px-2 py-1 rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">System Pattern (substring)</label>
            <input value={selectedSystem || ''} onChange={(e)=> setSelectedSystem(e.target.value || null)} placeholder="e.g. blackhole" className="w-full bg-gray-700 text-white px-2 py-1 rounded text-sm" />
          </div>
          <div className="flex items-end">
            <button onClick={startRecording} disabled={isRecording} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white px-4 py-2 rounded w-full text-sm">Apply & Start</button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-gray-800 rounded-lg p-4 flex flex-col min-h-[500px]">
        <div className="flex justify-between items-start mb-2 flex-shrink-0">
          <h2 className="text-lg font-semibold">Markdown Notes Editor</h2>
          <span className="text-xs text-gray-400">Tip: Use [MM:SS] format for timestamps, e.g., [01:30] Note here</span>
        </div>
        <div className="flex-1 min-h-100 border border-gray-700 rounded overflow-hidden">
          <Editor
            height="500px"
            width="100%"
            defaultLanguage="markdown"
            theme="vs-dark"
            value={notes}
            onChange={(value) => setNotes(value || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
              lineNumbers: 'on',
              automaticLayout: true,
            }}
          />
        </div>

      </div>
    </div>
  );
};