import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useRecordingStore } from '../store/recordingStore';
import { useDirectQuery } from '../hooks/useDirectQuery';

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
  
  const { addNote, clearNotes, selectedMic, selectedSystem, setSelectedMic, setSelectedSystem, setRecordingDuration } = useRecordingStore();
  
  // Use direct query hook
  const { checkForDirectQuery } = useDirectQuery();

  // --- Heading timestamp (non-intrusive) ---
  const headingLineRegex = /^#{1,6}\s+/; // H1~H6
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const contentWidgetsRef = useRef<any[]>([]);

  const headingTsRef = useRef<Record<string, number>>({});
  const prevHeadingKeysRef = useRef<string[]>([]);

  const nowRelativeMs = () => Math.max(0, Date.now() - recordingStartTimeRef.current);

  // Build stable-ish keys: text + occurrence index among same texts
  const computeHeadingKeys = (lines: string[]) => {
    const keys: string[] = [];
    const positions: Array<{ lineNumber: number; key: string; text: string }> = [];
    const counts: Record<string, number> = {};
    lines.forEach((line, idx) => {
      if (headingLineRegex.test(line)) {
        const text = line.trim();
        const base = text;
        const n = counts[base] || 0;
        counts[base] = n + 1;
        const key = `${base}@@${n}`;
        keys.push(key);
        positions.push({ lineNumber: idx + 1, key, text: base });
      }
    });
    return { keys, positions };
  };

  const formatMMSS = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const clearContentWidgets = () => {
    const editor = editorRef.current;
    if (!editor) return;
    for (const w of contentWidgetsRef.current) {
      try { editor.removeContentWidget(w); } catch {}
    }
    contentWidgetsRef.current = [];
  };

  const updateHeadingWidgets = () => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    clearContentWidgets();

    const lines = model.getLinesContent();
    const { positions } = computeHeadingKeys(lines);

    positions.forEach(({ lineNumber, key }) => {
      const hasTs = headingTsRef.current[key] != null;
      const ts = headingTsRef.current[key];
      // If recording and no timestamp yet (e.g., pre-existing heading), show placeholder
      const label = hasTs ? `⏱ ${formatMMSS(ts!)}` : (isRecording ? '⏱ --:--' : null);
      if (!label) return;

      const id = `s2a-ts-${key}`;
      const node = document.createElement('div');
      node.className = `s2a-ts-chip ${hasTs ? '' : 's2a-ts-placeholder'}`.trim();
      node.textContent = label;

      const widget = {
        getId: () => id,
        getDomNode: () => node,
        getPosition: () => ({ position: { lineNumber, column: 1 }, preference: [monaco.contentWidgetPositionPreference.EXACT] }),
      };
      editor.addContentWidget(widget);
      contentWidgetsRef.current.push(widget);
    });
  };

  const updateHeadingTimestamps = (text: string) => {
    const lines = text.split('\n');
    const { keys } = computeHeadingKeys(lines);

    // If recording, assign timestamps to new headings only
    if (isRecording) {
      const prevKeys = new Set(prevHeadingKeysRef.current);
      keys.forEach((k) => {
        if (!(k in headingTsRef.current) && !prevKeys.has(k)) {
          headingTsRef.current[k] = nowRelativeMs();
        }
      });
    }

    prevHeadingKeysRef.current = keys;

    // Refresh widgets & marker hiding
    updateHeadingWidgets();
  };
  // --- End heading timestamp ---

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

      // Initialize heading timestamp baseline so existing headings don't get timestamps
      headingTsRef.current = {};
      try {
        const lines = (notes || '').split('\n');
        const { keys } = computeHeadingKeys(lines);
        prevHeadingKeysRef.current = keys;
      } catch {}
      // Refresh overlays
      try { updateHeadingWidgets(); } catch {}
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
        // Save markdown notes to file (raw, no injected markers)
        if (notes.trim()) {
          try {
            await window.electronAPI.file.saveMarkdown(sessionIdRef.current, notes);
            console.log('Markdown notes saved successfully');
          } catch (error) {
            console.error('Failed to save markdown notes:', error);
          }
        }
        
        // Parse notes into sections using Markdown headings (H1~H6)
        const rawLines = notes.split('\n');
        const sections: { headingKey: string | null; text: string }[] = [];
        let current: string[] = [];
        let currentKey: string | null = null;

        // For keying, recompute keys with occurrence indices
        const { positions } = computeHeadingKeys(rawLines);
        const lineToKey = new Map<number, string>();
        positions.forEach(p => lineToKey.set(p.lineNumber, p.key));

        rawLines.forEach((line, idx) => {
          if (headingLineRegex.test(line)) {
            if (current.length) {
              sections.push({ headingKey: currentKey, text: current.join('\n').trim() });
            }
            current = [line];
            currentKey = lineToKey.get(idx + 1) || null;
          } else {
            if (current.length) current.push(line);
          }
        });
        if (current.length) {
          sections.push({ headingKey: currentKey, text: current.join('\n').trim() });
        }

        const noteEntries = sections.length > 0
          ? sections
          : rawLines.filter(line => line.trim()).map(t => ({ headingKey: null, text: t }));

        const durationMs = stopResult?.duration ?? nowRelativeMs();

        noteEntries.forEach((entry, index) => {
          // Prefer in-memory heading timestamp if available
          let timestamp: number | null = null;
          if (entry.headingKey && headingTsRef.current[entry.headingKey] != null) {
            timestamp = headingTsRef.current[entry.headingKey];
          }

          // Next, support [MM:SS] at the start (with or without heading hashes)
          if (timestamp === null) {
            const tsMatch = entry.text.match(/^#{0,6}\s*\[(\d{2}):(\d{2})\]\s*([\s\S]*)/);
            if (tsMatch) {
              const minutes = parseInt(tsMatch[1], 10);
              const seconds = parseInt(tsMatch[2], 10);
              timestamp = (minutes * 60 + seconds) * 1000;
            }
          }

          // Finally, fallback to average distribution across total duration
          if (timestamp === null) {
            const denom = Math.max(noteEntries.length - 1, 1);
            timestamp = Math.floor((index / denom) * durationMs);
          }

          // Clean content: remove marker/comment and leading [MM:SS], keep heading hashes
          let content = entry.text
            .replace(/^(#{0,6})(\s*)\[(\d{2}):(\d{2})\]\s*/, (_m, hashes) => (hashes ? `${hashes} ` : ''))
            .trim();

          addNote({ content, timestamp });
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

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    updateHeadingWidgets();
    // Initialize prev keys so only new headings get timestamps while recording
    try { updateHeadingTimestamps(notes || ''); } catch {}
    editor.onDidChangeModelContent((e: any) => {
      updateHeadingTimestamps(editor.getValue());
      // Check for direct query trigger on Enter
      checkForDirectQuery(editor, e.changes);
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Inject styles to hide marker comments inside Monaco */}
      <style>{`
        .s2a-ts-chip { 
          position: absolute; 
          transform: translateY(-1.2em); 
          background: rgba(59,130,246,0.18); 
          color: #bfdbfe; 
          border: 1px solid rgba(59,130,246,0.4);
          font-size: 11px; 
          line-height: 1; 
          border-radius: 6px; 
          padding: 3px 6px; 
          pointer-events: none; 
          user-select: none; 
          z-index: 50;
          box-shadow: 0 1px 2px rgba(0,0,0,0.25);
        }
        .s2a-ts-placeholder { opacity: 0.6; }
      `}</style>
      {conversionMessage && (
        <div className="mb-2 px-4 py-2 rounded bg-gray-700 text-sm text-gray-200 shadow inline-flex items-center space-x-2">
          <span>🎵</span>
          <span>{conversionMessage}</span>
        </div>
      )}
      <div className="bg-gray-800 p-4 rounded-lg mb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => window.electronAPI.window.openFloatingWindow()}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded flex items-center space-x-2"
            >
              <span>🪟</span>
              <span>Floating Mode</span>
            </button>
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
          <span className="text-xs text-gray-400">Tip: Use headings (# ..) while recording; timestamps are auto-stamped</span>
        </div>
        <div className="flex-1 min-h-100 border border-gray-700 rounded overflow-hidden">
          <Editor
            height="500px"
            width="100%"
            defaultLanguage="markdown"
            theme="vs-dark"
            value={notes}
            onChange={(value) => {
              const v = value || '';
              setNotes(v);
              updateHeadingTimestamps(v);
            }}
            onMount={handleEditorMount}
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