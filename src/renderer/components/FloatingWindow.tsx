import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

interface FloatingWindowProps {
  onExpand: (sessionId?: string, notes?: string) => void;
  onClose: () => void;
}

export const FloatingWindow: React.FC<FloatingWindowProps> = ({ onExpand, onClose }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [notes, setNotes] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [outputPath, setOutputPath] = useState('');
  const [screenshotFrequency, setScreenshotFrequency] = useState(30);
  const [audioTracking, setAudioTracking] = useState({ mic: true, system: true });
  const [screenshotCount, setScreenshotCount] = useState(0);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const headingTsRef = useRef<Record<string, number>>({});

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
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartRecording = async () => {
    try {
      // Generate a session ID
      const newSessionId = `session_${Date.now()}`;
      setSessionId(newSessionId);
      
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
      setIsReadOnly(false);
      setRecordingTime(0);
      setScreenshotCount(0);
      headingTsRef.current = {};
      
      // You can add actual recording start logic here
      // await window.electronAPI.recording.start(screenId);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = async () => {
    try {
      setIsRecording(false);
      setIsReadOnly(true);
      
      // Save the notes if needed
      if (sessionId && notes.trim()) {
        await window.electronAPI.file.saveMarkdown(sessionId, notes);
      }
      
      // You can add actual recording stop logic here
      // await window.electronAPI.recording.stop();
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const selectOutputPath = async () => {
    try {
      const path = await window.electronAPI.file.selectOutputPath();
      if (path) {
        setOutputPath(path);
      }
    } catch (error) {
      console.error('Failed to select output path:', error);
    }
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Add keyboard shortcut for Ctrl/Cmd+M
    editor.addAction({
      id: 'jump-to-previous-position',
      label: 'Jump to 10 seconds ago',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyM
      ],
      run: (ed: any) => {
        // TODO: Implement jump to position 10 seconds ago
        console.log('Jump to previous position');
      }
    });
  };

  return (
    <div className="floating-window" style={{
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(31, 41, 55, 0.95)',
      borderRadius: '8px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      border: '1px solid rgba(75, 85, 99, 0.5)'
    }}>
      {/* Resize Handle */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '20px',
          height: '20px',
          cursor: 'nwse-resize',
          zIndex: 1000,
          background: 'linear-gradient(135deg, transparent 50%, rgba(156, 163, 175, 0.5) 50%)',
          borderBottomRightRadius: '8px'
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          // Allow native window resize
          const startX = e.clientX;
          const startY = e.clientY;
          const startWidth = window.innerWidth;
          const startHeight = window.innerHeight;

          const handleMouseMove = (e: MouseEvent) => {
            const newWidth = startWidth + e.clientX - startX;
            const newHeight = startHeight + e.clientY - startY;
            window.resizeTo(Math.max(300, newWidth), Math.max(200, newHeight));
          };

          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
          };

          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        }}
      />
      
      {/* Top Toolbar */}
      <div className="toolbar" style={{
        height: '40px',
        padding: '8px',
        borderBottom: '1px solid rgba(75, 85, 99, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0
      }}>
        {!isRecording ? (
          <button
            onClick={handleStartRecording}
            className="record-btn"
            style={{
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px'
            }}
          >
            <span style={{
              width: '8px',
              height: '8px',
              backgroundColor: 'white',
              borderRadius: '50%'
            }}></span>
            Start
          </button>
        ) : (
          <button
            onClick={handleStopRecording}
            className="stop-btn"
            style={{
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px'
            }}
          >
            <span style={{
              width: '8px',
              height: '8px',
              backgroundColor: 'white'
            }}></span>
            Stop
          </button>
        )}

        {/* Timer */}
        <div style={{
          color: '#e5e7eb',
          fontSize: '14px',
          fontFamily: 'monospace',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          ⏱ {formatTime(recordingTime)}
        </div>

        {/* Settings Button */}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ⚙
          </button>

          {/* Settings Popover */}
          {showSettings && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              backgroundColor: 'rgba(31, 41, 55, 0.98)',
              border: '1px solid rgba(75, 85, 99, 0.5)',
              borderRadius: '4px',
              padding: '12px',
              minWidth: '200px',
              zIndex: 1000,
              fontSize: '12px',
              color: '#e5e7eb'
            }}>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '4px' }}>Output Path:</label>
                <button
                  onClick={selectOutputPath}
                  style={{
                    width: '100%',
                    padding: '4px',
                    backgroundColor: '#374151',
                    border: '1px solid #4b5563',
                    borderRadius: '4px',
                    color: '#e5e7eb',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  {outputPath || 'Select Path...'}
                </button>
              </div>

              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '4px' }}>Screenshot Frequency:</label>
                <select
                  value={screenshotFrequency}
                  onChange={(e) => setScreenshotFrequency(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '4px',
                    backgroundColor: '#374151',
                    border: '1px solid #4b5563',
                    borderRadius: '4px',
                    color: '#e5e7eb',
                    fontSize: '11px'
                  }}
                >
                  <option value={10}>10 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>60 seconds</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '4px' }}>Audio Tracks:</label>
                <label style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                  <input
                    type="checkbox"
                    checked={audioTracking.mic}
                    onChange={(e) => setAudioTracking({ ...audioTracking, mic: e.target.checked })}
                    style={{ marginRight: '4px' }}
                  />
                  Microphone
                </label>
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={audioTracking.system}
                    onChange={(e) => setAudioTracking({ ...audioTracking, system: e.target.checked })}
                    style={{ marginRight: '4px' }}
                  />
                  System Audio
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '0 4px'
          }}
        >
          ×
        </button>
      </div>

      {/* Markdown Editor Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden'
      }}>
        <div style={{
          flex: 1,
          position: 'relative'
        }}>
          <Editor
            height="100%"
            defaultLanguage="markdown"
            theme="vs-dark"
            value={notes}
            onChange={(value) => setNotes(value || '')}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              wordWrap: 'on',
              lineNumbers: 'off',
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 4, bottom: 4 },
              readOnly: isReadOnly
            }}
          />
        </div>

        {/* Sidebar toggle for preview */}
        <button
          onClick={() => setShowPreview(!showPreview)}
          style={{
            width: '20px',
            backgroundColor: '#374151',
            border: 'none',
            borderLeft: '1px solid rgba(75, 85, 99, 0.3)',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: '12px',
            writingMode: 'vertical-rl',
            textOrientation: 'mixed'
          }}
        >
          {showPreview ? '◀' : '▶'}
        </button>

        {/* Markdown Preview (optional) */}
        {showPreview && (
          <div style={{
            width: '150px',
            backgroundColor: '#1f2937',
            borderLeft: '1px solid rgba(75, 85, 99, 0.3)',
            padding: '8px',
            overflow: 'auto',
            fontSize: '11px',
            color: '#e5e7eb'
          }}>
            {/* TODO: Add markdown preview rendering */}
            <div dangerouslySetInnerHTML={{ __html: notes }} />
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div style={{
        height: '30px',
        padding: '4px 8px',
        borderTop: '1px solid rgba(75, 85, 99, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '11px',
        color: '#9ca3af'
      }}>
        <span>📸 {screenshotCount} screenshots</span>
        <span>🎵 {formatTime(recordingTime)}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{
            width: '8px',
            height: '8px',
            backgroundColor: '#10b981',
            borderRadius: '50%'
          }}></span>
          Normal
        </span>

        {/* Expand button when recording is stopped */}
        {isReadOnly && (
          <button
            onClick={() => onExpand(sessionId || undefined, notes)}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            ⤢ Expand
          </button>
        )}
      </div>
    </div>
  );
};