import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { useRecordingStore } from '../store/recordingStore';
import { ParagraphWidget } from '../components/ParagraphWidget';
import ReactDOM from 'react-dom/client';

interface ReviewPageWithWidgetsProps {
  sessionId: string;
}

interface ParsedNote {
  content: string;
  timestamp: number;
  lineNumber: number;
  isH1: boolean;
}

interface WidgetZone {
  id: string;
  domNode: HTMLElement;
  afterLineNumber: number;
  heightInPx: number;
}

export const ReviewPageWithWidgets: React.FC<ReviewPageWithWidgetsProps> = ({ sessionId }) => {
  const [markdownContent, setMarkdownContent] = useState('');
  const [parsedNotes, setParsedNotes] = useState<ParsedNote[]>([]);
  const [audioPath, setAudioPath] = useState<string>('');
  const [recordingMetadata, setRecordingMetadata] = useState<any>(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<{ note: ParsedNote } | null>(null);
  const [mcpServers, setMcpServers] = useState<Array<any>>([]);
  const [selectedMcpServer, setSelectedMcpServer] = useState<string>('');
  const [mcpTools, setMcpTools] = useState<Array<any>>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editorMounted, setEditorMounted] = useState(false);
  
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const widgetZonesRef = useRef<Map<string, WidgetZone>>(new Map());
  const widgetRootsRef = useRef<Map<string, ReactDOM.Root>>(new Map());
  const decorationsRef = useRef<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { notes: storeNotes } = useRecordingStore();

  useEffect(() => {
    loadMarkdownFile();
    loadAudioPath();
    loadMcpServers();
  }, [sessionId]);

  // Load MCP servers
  const loadMcpServers = async () => {
    try {
      const result = await window.electronAPI.ai.sendCommand({
        action: 'get_mcp_servers',
        payload: {},
      });
      if (result.servers) {
        setMcpServers(result.servers);
      }
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
    }
  };

  // Load MCP tools when server is selected
  useEffect(() => {
    const loadMcpTools = async () => {
      if (!selectedMcpServer) return;
      
      try {
        // First activate the server
        await window.electronAPI.ai.sendCommand({
          action: 'activate_mcp_server',
          payload: { server_name: selectedMcpServer },
        });
        
        // Then list available tools
        const result = await window.electronAPI.ai.sendCommand({
          action: 'list_mcp_tools',
          payload: {},
        });
        if (result.tools) {
          setMcpTools(result.tools);
        }
      } catch (error) {
        console.error('Failed to load MCP tools:', error);
      }
    };
    loadMcpTools();
  }, [selectedMcpServer]);

  // Update widgets when editor is mounted and notes are parsed
  useEffect(() => {
    if (editorMounted && editorRef.current && monacoRef.current && parsedNotes.length > 0) {
      console.log('Updating widgets - Editor mounted, notes parsed:', parsedNotes.filter(n => n.isH1).length, 'H1 headers found');
      
      // Create widget zones for H1 headers
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      
      // Clear existing widgets
      widgetRootsRef.current.forEach(root => root.unmount());
      widgetRootsRef.current.clear();
      widgetZonesRef.current.clear();

      // Find all H1 headers and create widget zones
      const h1Notes = parsedNotes.filter(note => note.isH1);
      console.log('Creating widgets for H1 notes:', h1Notes.map(n => ({ line: n.lineNumber, content: n.content.substring(0, 30) })));
      
      if (h1Notes.length === 0) {
        console.log('No H1 headers found, skipping widget creation');
        return;
      }
      
      const newZones: any[] = [];

      h1Notes.forEach((note, index) => {
        const widgetId = `widget-${note.lineNumber}-${index}`;
        console.log(`Creating widget ${widgetId} for line ${note.lineNumber}`);
        
        // Create DOM node for the widget
        const domNode = document.createElement('div');
        domNode.className = 'paragraph-widget-container';
        domNode.style.marginTop = '8px';
        domNode.style.marginBottom = '8px';

        // Find the end timestamp (next note's timestamp or recording end)
        const nextNoteIndex = parsedNotes.findIndex(n => n.timestamp > note.timestamp);
        const maxReasonableGap = 60000; // Max 60 seconds between sections
        const endTimestamp = nextNoteIndex !== -1 
          ? Math.min(parsedNotes[nextNoteIndex].timestamp, note.timestamp + maxReasonableGap)
          : note.timestamp + 15000; // Default to 15 seconds
        
        console.log(`Widget for line ${note.lineNumber}: timestamp=${note.timestamp}, endTimestamp=${endTimestamp}`);

        // Create React root and render the widget
        const root = ReactDOM.createRoot(domNode);
        root.render(
          <ParagraphWidget
            sessionId={sessionId}
            timestamp={note.timestamp}
            endTimestamp={endTimestamp}
            onInsertScreenshot={(path) => handleInsertScreenshot(path, note.lineNumber)}
            onStartChat={() => handleStartChat(note)}
            onPlayAudio={() => handlePlayAudio(note.timestamp)}
          />
        );

        widgetRootsRef.current.set(widgetId, root);
        widgetZonesRef.current.set(widgetId, {
          id: widgetId,
          domNode,
          afterLineNumber: Math.max(0, note.lineNumber - 1),
          heightInPx: 120
        });

        newZones.push({
          afterLineNumber: Math.max(0, note.lineNumber - 1),
          heightInPx: 120,
          domNode: domNode,
          suppressMouseDown: true
        });
      });

      // Update the editor layout with new widget zones
      editor.changeViewZones((changeAccessor: any) => {
        // Remove old zones
        widgetZonesRef.current.forEach(zone => {
          try {
            changeAccessor.removeZone(zone.id);
          } catch (e) {
            // Zone might not exist
          }
        });

        // Add new zones
        newZones.forEach(zone => {
          const id = changeAccessor.addZone(zone);
          console.log(`Added zone with id ${id} after line ${zone.afterLineNumber}`);
          // Update the zone ID reference
          const widgetKey = Array.from(widgetZonesRef.current.keys()).find(
            key => widgetZonesRef.current.get(key)?.domNode === zone.domNode
          );
          if (widgetKey) {
            const zoneData = widgetZonesRef.current.get(widgetKey);
            if (zoneData) {
              zoneData.id = id;
            }
          }
        });
      });
    }
  }, [editorMounted, parsedNotes, sessionId]);

  const parseMarkdownToNotes = (markdown: string, duration: number): ParsedNote[] => {
    const lines = markdown.split('\n');
    const notes: ParsedNote[] = [];
    const h1Regex = /^#\s+/;
    const headingRegex = /^#{1,6}\s+/;
    
    let currentSection: string[] = [];
    let currentTimestamp: number | null = null;
    let currentLineNumber = 1;
    let sectionStartLine = 1;
    let isH1Section = false;
    
    lines.forEach((line, index) => {
      // Check if line is a heading
      if (headingRegex.test(line)) {
        // Save previous section if exists
        if (currentSection.length > 0) {
          const content = currentSection.join('\n').trim();
          if (content) {
            notes.push({
              content,
              timestamp: currentTimestamp || 0,
              lineNumber: sectionStartLine,
              isH1: isH1Section
            });
          }
        }
        
        // Start new section
        currentSection = [line];
        sectionStartLine = currentLineNumber;
        isH1Section = h1Regex.test(line);
        
        // Try to extract timestamp from [MM:SS] format in heading
        const tsMatch = line.match(/\[(\d{2}):(\d{2})\]/);
        if (tsMatch) {
          const minutes = parseInt(tsMatch[1], 10);
          const seconds = parseInt(tsMatch[2], 10);
          currentTimestamp = (minutes * 60 + seconds) * 1000;
        } else {
          currentTimestamp = null;
        }
      } else {
        currentSection.push(line);
      }
      
      currentLineNumber++;
    });
    
    // Add the last section
    if (currentSection.length > 0) {
      const content = currentSection.join('\n').trim();
      if (content) {
        notes.push({
          content,
          timestamp: currentTimestamp || 0,
          lineNumber: sectionStartLine,
          isH1: isH1Section
        });
      }
    }
    
    // If no sections found, treat the whole content as one note
    if (notes.length === 0 && markdown.trim()) {
      notes.push({
        content: markdown.trim(),
        timestamp: 0,
        lineNumber: 1,
        isH1: false
      });
    }
    
    // Distribute timestamps evenly if not specified
    if (notes.length > 0 && duration > 0) {
      // Ensure duration is in milliseconds and reasonable
      const maxReasonableDuration = 10 * 60 * 60 * 1000; // 10 hours in ms
      let durationMs = duration;
      
      // If duration seems to be in nanoseconds (> 1 trillion), convert to ms
      if (duration > 1000000000000) {
        durationMs = Math.floor(duration / 1000000);
        console.log(`Converting duration from nanoseconds: ${duration} -> ${durationMs}ms`);
      }
      // If duration seems too large but not nanoseconds, might be microseconds
      else if (duration > maxReasonableDuration) {
        durationMs = Math.floor(duration / 1000);
        console.log(`Converting duration from microseconds: ${duration} -> ${durationMs}ms`);
      }
      
      const timePerNote = durationMs / notes.length;
      
      notes.forEach((note, index) => {
        if (note.timestamp === 0 && index > 0) {
          note.timestamp = Math.floor(index * timePerNote);
        }
        // Also cap existing timestamps if they're unreasonable
        if (note.timestamp > durationMs) {
          note.timestamp = Math.min(note.timestamp, durationMs);
        }
      });
    }
    
    console.log('Parsed notes with timestamps:', notes.map(n => ({ 
      line: n.lineNumber, 
      isH1: n.isH1,
      timestamp: n.timestamp,
      content: n.content.substring(0, 30) 
    })));
    
    return notes;
  };

  const loadMarkdownFile = async () => {
    try {
      // Load recording metadata which includes markdown notes
      const metadata = await window.electronAPI.file.loadRecording(sessionId);
      setRecordingMetadata(metadata);
      
      if (metadata && metadata.notes) {
        setMarkdownContent(metadata.notes);
        // Parse the markdown to extract notes with timestamps
        console.log('Recording metadata duration:', metadata.duration);
        const parsed = parseMarkdownToNotes(metadata.notes, metadata.duration || 0);
        setParsedNotes(parsed);
      } else if (storeNotes.length > 0) {
        // Use notes from store if available
        const content = storeNotes.map(note => note.content).join('\n\n');
        setMarkdownContent(content);
        const parsed = parseMarkdownToNotes(content, 0);
        setParsedNotes(parsed);
      } else {
        const defaultContent = '# Recording Notes\n\nNo notes available for this session.';
        setMarkdownContent(defaultContent);
        setParsedNotes(parseMarkdownToNotes(defaultContent, 0));
      }
    } catch (error) {
      console.error('Failed to load markdown:', error);
      const defaultContent = '# Recording Notes\n\nNo notes available for this session.';
      setMarkdownContent(defaultContent);
      setParsedNotes(parseMarkdownToNotes(defaultContent, 0));
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

  const handleInsertScreenshot = (path: string, lineNumber: number) => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    const model = editor.getModel();
    if (!model) return;

    // Insert at the end of the current section
    const imageMarkdown = `\n![Screenshot](file://${path})\n`;
    
    // Find the end of the current section
    let insertLine = lineNumber;
    for (let i = lineNumber + 1; i <= model.getLineCount(); i++) {
      const lineContent = model.getLineContent(i);
      if (/^#{1,6}\s+/.test(lineContent) || i === model.getLineCount()) {
        insertLine = i - 1;
        break;
      }
    }

    const position = { lineNumber: insertLine, column: model.getLineMaxColumn(insertLine) };
    const range = new (monacoRef.current as any).Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    );

    editor.executeEdits('insert-screenshot', [{
      range: range,
      text: imageMarkdown,
      forceMoveMarkers: true
    }]);

    // Update content after insertion
    setMarkdownContent(model.getValue());
  };

  const handleStartChat = (note: ParsedNote) => {
    setChatContext({ note });
    setAiChatOpen(true);
    // Set initial prompt with context from the note
    const contextPrompt = `Context from note at ${formatTimestamp(note.timestamp)}:\n\n${note.content}\n\nHow can I help you with this section?`;
    setAiPrompt(contextPrompt);
  };

  const handleSendToAI = async () => {
    if (!aiPrompt.trim()) return;
    
    setIsProcessing(true);
    setAiResponse('');
    
    try {
      // Use MCP if server is selected, otherwise use standard AI
      if (selectedMcpServer) {
        const result = await window.electronAPI.ai.sendCommand({
          action: 'send_mcp_message',
          payload: {
            message: aiPrompt,
            context: chatContext?.note.content || ''
          },
        });
        setAiResponse(result.response || 'No response received');
      } else {
        // Fallback to standard AI service
        const result = await window.electronAPI.ai.enhanceNote({
          note: chatContext?.note.content || '',
          prompt: aiPrompt,
          sessionId: sessionId
        });
        setAiResponse(result.enhanced || 'No response received');
      }
    } catch (error) {
      console.error('AI processing failed:', error);
      setAiResponse('Error: Failed to process request');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlayAudio = async (timestamp: number) => {
    if (!audioPath) return;
    
    try {
      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(`file://${audioPath}`);
      audioRef.current = audio;
      audio.currentTime = timestamp / 1000;
      await audio.play();
      
      // Stop after 15 seconds
      setTimeout(() => {
        if (audioRef.current === audio) {
          audio.pause();
          audioRef.current = null;
        }
      }, 15000);
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };

  const handleEditorMount = (editor: any, monaco: Monaco) => {
    console.log('Editor mounted');
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure the editor
    editor.updateOptions({
      glyphMargin: true,
      lineDecorationsWidth: 10,
      lineNumbersMinChars: 3,
      folding: false
    });

    // Add decorations for timestamps
    const model = editor.getModel();
    if (model && parsedNotes.length > 0) {
      const newDecorations: any[] = [];
      
      parsedNotes.forEach((note) => {
        if (note.isH1) {
          // Add decoration for H1 headers with timestamps
          newDecorations.push({
            range: new monaco.Range(note.lineNumber, 1, note.lineNumber, 1),
            options: {
              isWholeLine: false,
              className: 'h1-timestamp-decoration',
              glyphMarginClassName: 'h1-timestamp-glyph',
              glyphMarginHoverMessage: {
                value: `⏱ ${formatTimestamp(note.timestamp)}`
              }
            }
          });
        }
      });

      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
      console.log('Added decorations for', newDecorations.length, 'H1 headers');
    }

    // Mark editor as mounted
    setEditorMounted(true);
  };

  const handleContentChange = (value: string | undefined) => {
    if (value !== undefined) {
      setMarkdownContent(value);
      // Re-parse the content to update notes
      const parsed = parseMarkdownToNotes(value, recordingMetadata?.duration || 0);
      setParsedNotes(parsed);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <style>{`
        .h1-timestamp-decoration {
          border-left: 3px solid #10b981;
          margin-left: 4px;
        }
        .h1-timestamp-glyph {
          background-color: #10b981;
          color: white;
          font-size: 10px;
          padding: 2px;
          border-radius: 2px;
        }
        .h1-timestamp-glyph::before {
          content: 'H1';
          font-weight: bold;
        }
        .paragraph-widget-container {
          padding: 0 20px;
        }
        .monaco-editor .view-zones {
          position: relative;
        }
      `}</style>

      {/* Header */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <h1 className="text-xl font-semibold text-white">Review Session with Widgets</h1>
        <p className="text-sm text-gray-400 mt-1">
          Session ID: {sessionId}
        </p>
      </div>

      {/* Main Audio Player */}
      {audioPath && (
        <div className="bg-gray-800 p-4 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">🎵 Full Session Audio:</span>
            <audio 
              controls 
              className="flex-1"
              src={`file://${audioPath}`}
              style={{ maxWidth: '600px' }}
            />
          </div>
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1 p-4">
        <div className="h-full bg-gray-800 rounded-lg overflow-hidden">
          <Editor
            height="100%"
            defaultLanguage="markdown"
            theme="vs-dark"
            value={markdownContent}
            onChange={handleContentChange}
            onMount={handleEditorMount}
            options={{
              fontSize: 14,
              wordWrap: 'on',
              lineNumbers: 'on',
              minimap: { enabled: false },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 10, bottom: 10 },
              lineHeight: 21,
              renderLineHighlight: 'all',
              contextmenu: true,
              quickSuggestions: false,
              parameterHints: { enabled: false },
              suggestOnTriggerCharacters: false,
              acceptSuggestionOnCommitCharacter: false,
              tabCompletion: 'off',
              wordBasedSuggestions: false
            }}
          />
        </div>
      </div>

      {/* AI Chat Sidebar with MCP integration */}
      {aiChatOpen && (
        <div className="fixed right-0 top-0 h-full w-96 bg-gray-800 border-l border-gray-700 shadow-lg z-50 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">AI Assistant</h2>
              <button
                onClick={() => setAiChatOpen(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
          </div>

          {/* MCP Server Selection */}
          {mcpServers.length > 0 && (
            <div className="p-4 border-b border-gray-700">
              <label className="block text-sm text-gray-400 mb-2">MCP Server (Optional)</label>
              <select
                value={selectedMcpServer}
                onChange={(e) => setSelectedMcpServer(e.target.value)}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Standard AI (No MCP)</option>
                {mcpServers.map((server: any) => (
                  <option key={server.name} value={server.name}>
                    {server.name}
                  </option>
                ))}
              </select>
              {selectedMcpServer && mcpTools.length > 0 && (
                <div className="mt-2 text-xs text-gray-500">
                  {mcpTools.length} tools available
                </div>
              )}
            </div>
          )}

          {/* Context Display */}
          {chatContext && (
            <div className="p-4 border-b border-gray-700">
              <p className="text-sm text-gray-400 mb-2">
                Context: Section at {formatTimestamp(chatContext.note.timestamp)}
              </p>
              <div className="bg-gray-900 p-3 rounded max-h-32 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-xs text-gray-300">
                  {chatContext.note.content.substring(0, 300)}
                  {chatContext.note.content.length > 300 && '...'}
                </pre>
              </div>
            </div>
          )}

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto p-4">
            {aiResponse && (
              <div className="mb-4">
                <div className="text-sm font-medium text-gray-400 mb-2">AI Response:</div>
                <div className="bg-gray-900 p-3 rounded">
                  <pre className="whitespace-pre-wrap text-sm text-gray-300">
                    {aiResponse}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-700">
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Ask about this section..."
              className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
              rows={3}
              disabled={isProcessing}
            />
            <button
              onClick={handleSendToAI}
              disabled={isProcessing || !aiPrompt.trim()}
              className={`mt-2 w-full px-4 py-2 rounded font-medium transition-colors ${
                isProcessing || !aiPrompt.trim()
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isProcessing ? 'Processing...' : 'Send to AI'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};