import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useRecordingStore } from '../store/recordingStore';

interface ReviewPageEnhancedProps {
  sessionId: string;
}

export const ReviewPageEnhanced: React.FC<ReviewPageEnhancedProps> = ({ sessionId }) => {
  const [markdownContent, setMarkdownContent] = useState('');
  const [hoveredTimestamp, setHoveredTimestamp] = useState<number | null>(null);
  const [hoveredPosition, setHoveredPosition] = useState<{ x: number; y: number } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [audioPath, setAudioPath] = useState<string>('');
  
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const { notes } = useRecordingStore();

  useEffect(() => {
    loadMarkdownFile();
    loadAudioPath();
  }, [sessionId]);

  const loadMarkdownFile = async () => {
    try {
      const metadata = await window.electronAPI.file.loadRecording(sessionId);
      // Load markdown notes from file
      const fs = require('fs').promises;
      const path = require('path');
      const sessionDir = path.join(process.cwd(), 'recordings', sessionId);
      const markdownPath = path.join(sessionDir, 'notes.md');
      const content = await fs.readFile(markdownPath, 'utf-8');
      setMarkdownContent(content || '# Recording Notes\n\nNo notes available for this session.');
    } catch (error) {
      console.error('Failed to load markdown:', error);
      // Construct markdown from notes if file not found
      const content = notes.map(note => note.content).join('\n\n');
      setMarkdownContent(content || '# Recording Notes\n\nNo notes available for this session.');
    }
  };

  const loadAudioPath = async () => {
    try {
      const path = await window.electronAPI.audio.getCompleteAudioPath(sessionId, 'mix');
      setAudioPath(path);
    } catch (error) {
      console.error('Failed to load audio path:', error);
    }
  };

  const formatTimestamp = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Add hover provider for interactive tooltips
    monaco.languages.registerHoverProvider('markdown', {
      provideHover: async (model: any, position: any) => {
        const line = model.getLineContent(position.lineNumber);
        const word = model.getWordAtPosition(position);
        
        if (!word) return null;

        // Find the note index based on line position
        const lineOffset = model.getOffsetAt(position);
        let currentOffset = 0;
        let noteIndex = -1;
        
        for (let i = 0; i < notes.length; i++) {
          const noteLength = notes[i].content.length;
          if (currentOffset <= lineOffset && lineOffset < currentOffset + noteLength) {
            noteIndex = i;
            break;
          }
          currentOffset += noteLength + 2; // +2 for \n\n between notes
        }

        if (noteIndex === -1) return null;

        const timestamp = notes[noteIndex].timestamp;
        const endTimestamp = noteIndex < notes.length - 1 
          ? notes[noteIndex + 1].timestamp 
          : timestamp + 5000; // 5 seconds for last note

        // Load screenshot for this timestamp
        try {
          const screenshotPath = await window.electronAPI.file.getScreenshotPath(
            sessionId, 
            timestamp, 
            'thumb'
          );

          return {
            range: new monaco.Range(
              position.lineNumber,
              word.startColumn,
              position.lineNumber,
              word.endColumn
            ),
            contents: [
              { value: `**Timestamp:** ${formatTimestamp(timestamp)}` },
              { value: `![Screenshot](file://${screenshotPath})` },
              { value: `[🔊 Play Audio](javascript:void(0))` }
            ]
          };
        } catch (error) {
          console.error('Failed to load screenshot:', error);
          return null;
        }
      }
    });

    // Add mouse move handler for floating tooltip
    editor.onMouseMove((e: any) => {
      if (!e.target.position) {
        setHoveredPosition(null);
        return;
      }

      const position = e.target.position;
      const lineOffset = model.getOffsetAt(position);
      let currentOffset = 0;
      let noteIndex = -1;
      
      for (let i = 0; i < notes.length; i++) {
        const noteLength = notes[i].content.length;
        if (currentOffset <= lineOffset && lineOffset < currentOffset + noteLength) {
          noteIndex = i;
          break;
        }
        currentOffset += noteLength + 2;
      }

      if (noteIndex !== -1) {
        setHoveredTimestamp(notes[noteIndex].timestamp);
        setHoveredPosition({
          x: e.event.posx,
          y: e.event.posy
        });
      } else {
        setHoveredPosition(null);
      }
    });

    // Add decorations for timestamps
    const model = editor.getModel();
    if (model) {
      const newDecorations: any[] = [];
      let currentLine = 1;
      
      notes.forEach((note, index) => {
        const lines = note.content.split('\n');
        const firstLine = currentLine;
        
        // Add decoration for timestamp
        newDecorations.push({
          range: new monaco.Range(firstLine, 1, firstLine, 1),
          options: {
            isWholeLine: false,
            className: 'timestamp-decoration',
            glyphMarginClassName: 'timestamp-glyph',
            glyphMarginHoverMessage: {
              value: `⏱ ${formatTimestamp(note.timestamp)}`
            }
          }
        });
        
        currentLine += lines.length + 1; // +1 for paragraph break
      });

      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
    }

    // Add double-click handler to insert images
    editor.onMouseDown((e: any) => {
      if (e.event.detail === 2) { // Double click
        handleDoubleClick(e);
      }
    });
  };

  const handleDoubleClick = async (e: any) => {
    if (!e.target.position || !editorRef.current) return;

    const position = e.target.position;
    const model = editorRef.current.getModel();
    const lineOffset = model.getOffsetAt(position);
    
    let currentOffset = 0;
    let noteIndex = -1;
    
    for (let i = 0; i < notes.length; i++) {
      const noteLength = notes[i].content.length;
      if (currentOffset <= lineOffset && lineOffset < currentOffset + noteLength) {
        noteIndex = i;
        break;
      }
      currentOffset += noteLength + 2;
    }

    if (noteIndex === -1) return;

    const timestamp = notes[noteIndex].timestamp;
    
    try {
      const screenshotPath = await window.electronAPI.file.getScreenshotPath(
        sessionId,
        timestamp,
        'full'
      );

      // Insert image markdown at cursor position
      const imageMarkdown = `\n![Screenshot at ${formatTimestamp(timestamp)}](file://${screenshotPath})\n`;
      const selection = editorRef.current.getSelection();
      
      editorRef.current.executeEdits('insert-image', [{
        range: selection,
        text: imageMarkdown,
        forceMoveMarkers: true
      }]);
    } catch (error) {
      console.error('Failed to insert image:', error);
    }
  };

  const playAudioAtTimestamp = async (timestamp: number) => {
    if (!audioPath) return;
    
    try {
      const audio = new Audio(audioPath);
      audio.currentTime = timestamp / 1000;
      await audio.play();
      
      // Stop after 10 seconds or at next note
      setTimeout(() => {
        audio.pause();
      }, 10000);
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <style>{`
        .timestamp-decoration {
          border-left: 2px solid #3b82f6;
          margin-left: 4px;
        }
        .timestamp-glyph {
          background-color: #3b82f6;
          color: white;
          font-size: 10px;
          padding: 2px;
          border-radius: 2px;
        }
        .timestamp-glyph::before {
          content: '⏱';
        }
        .monaco-hover {
          max-width: 400px;
        }
        .monaco-hover img {
          max-width: 300px;
          border-radius: 4px;
          margin: 8px 0;
        }
      `}</style>

      {/* Header */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <h1 className="text-xl font-semibold text-white">Review Session - Enhanced Monaco Editor</h1>
        <p className="text-sm text-gray-400 mt-1">
          Hover over text to see screenshots • Double-click to insert images
        </p>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 p-4">
        <div className="h-full bg-gray-800 rounded-lg overflow-hidden">
          <Editor
            height="100%"
            defaultLanguage="markdown"
            theme="vs-dark"
            value={markdownContent}
            onChange={(value) => setMarkdownContent(value || '')}
            onMount={handleEditorMount}
            options={{
              fontSize: 14,
              wordWrap: 'on',
              lineNumbers: 'on',
              minimap: { enabled: false },
              automaticLayout: true,
              glyphMargin: true,
              scrollBeyondLastLine: false,
              hover: {
                enabled: true,
                delay: 300
              }
            }}
          />
        </div>
      </div>

      {/* Floating Tooltip Overlay */}
      {hoveredPosition && hoveredTimestamp !== null && (
        <div
          className="absolute z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-3"
          style={{
            left: hoveredPosition.x + 10,
            top: hoveredPosition.y + 10,
            maxWidth: '350px'
          }}
        >
          <div className="text-sm text-gray-300 mb-2">
            ⏱ {formatTimestamp(hoveredTimestamp)}
          </div>
          
          {/* Screenshot Preview */}
          <div className="mb-2">
            <ScreenshotPreview 
              sessionId={sessionId} 
              timestamp={hoveredTimestamp} 
            />
          </div>

          {/* Audio Controls */}
          <button
            onClick={() => playAudioAtTimestamp(hoveredTimestamp)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm flex items-center gap-2"
          >
            <span>🔊</span>
            <span>Play Audio</span>
          </button>
        </div>
      )}
    </div>
  );
};

// Screenshot Preview Component
const ScreenshotPreview: React.FC<{ sessionId: string; timestamp: number }> = ({ 
  sessionId, 
  timestamp 
}) => {
  const [imagePath, setImagePath] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadScreenshot = async () => {
      try {
        const path = await window.electronAPI.file.getScreenshotPath(
          sessionId,
          timestamp,
          'thumb'
        );
        setImagePath(path);
      } catch (error) {
        console.error('Failed to load screenshot:', error);
      } finally {
        setLoading(false);
      }
    };

    loadScreenshot();
  }, [sessionId, timestamp]);

  if (loading) {
    return (
      <div className="w-full h-32 bg-gray-700 rounded animate-pulse flex items-center justify-center">
        <span className="text-gray-500">Loading...</span>
      </div>
    );
  }

  if (!imagePath) {
    return (
      <div className="w-full h-32 bg-gray-700 rounded flex items-center justify-center">
        <span className="text-gray-500">No screenshot</span>
      </div>
    );
  }

  return (
    <img 
      src={`file://${imagePath}`}
      alt="Screenshot preview"
      className="w-full rounded border border-gray-600"
      style={{ maxHeight: '200px', objectFit: 'contain' }}
    />
  );
};