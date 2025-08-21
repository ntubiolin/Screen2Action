import React, { useState, useEffect, useRef } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { 
  Camera, 
  Play, 
  Pause,
  Square,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Edit
} from 'lucide-react';

interface ReviewPageSidebarProps {
  sessionId: string;
}

interface ParsedNote {
  content: string;
  timestamp: number;
  lineNumber: number;
  endLineNumber: number;
  isH1: boolean;
}

interface Screenshot {
  path: string;
  timestamp: number;
  selected: boolean;
}

export const ReviewPageSidebar: React.FC<ReviewPageSidebarProps> = ({ sessionId }) => {
  const [markdownContent, setMarkdownContent] = useState('');
  const [parsedNotes, setParsedNotes] = useState<ParsedNote[]>([]);
  const [audioPath, setAudioPath] = useState<string>('');
  const [recordingMetadata, setRecordingMetadata] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentParagraph, setCurrentParagraph] = useState<ParsedNote | null>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [decorationIds, setDecorationIds] = useState<string[]>([]);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [sectionHeights, setSectionHeights] = useState({
    screenshots: 35,
    mcp: 30,
    chat: 35,
  });
  // Keep a ref in sync with latest heights to avoid stale closures in mouse handlers
  const sectionHeightsRef = useRef(sectionHeights);
  useEffect(() => {
    sectionHeightsRef.current = sectionHeights;
  }, [sectionHeights]);
  
  // Screenshot related state
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loadingScreenshots, setLoadingScreenshots] = useState(false);
  const [selectedScreenshots, setSelectedScreenshots] = useState<Set<number>>(new Set());
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // ESC key to close screenshot preview modal
      if (event.key === 'Escape' && previewScreenshot) {
        setPreviewScreenshot(null);
        setZoomLevel(1);
        return;
      }
      
      // Ctrl/Cmd + Shift + P to toggle preview mode
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'P') {
        event.preventDefault();
        setIsPreviewMode(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [previewScreenshot]);
  
  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  
  // MCP and AI Chat state
  const [mcpServers, setMcpServers] = useState<Array<any>>([]);
  const [selectedMcpServer, setSelectedMcpServer] = useState<string>('');
  const [mcpTools, setMcpTools] = useState<Array<any>>([]);
  const [selectedMcpTools, setSelectedMcpTools] = useState<Set<string>>(new Set());
  const [mcpToolsExpanded, setMcpToolsExpanded] = useState(true);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const resizeRef1 = useRef<HTMLDivElement>(null); // Between screenshots and MCP
  const resizeRef2 = useRef<HTMLDivElement>(null); // Between MCP and chat
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootTop, setRootTop] = useState(0);
  const decorationCollectionRef = useRef<any>(null);

  // Refs to manage drag state to avoid re-renders breaking the drag handlers
  const isResizing1Ref = useRef(false);
  const isResizing2Ref = useRef(false);
  const startYRef = useRef(0);
  const startHeightsRef = useRef(sectionHeights);

  useEffect(() => {
    loadMarkdownFile();
    loadAudioPath();
    loadMcpServers();
  }, [sessionId]);

  // Measure top offset so the fixed sidebar aligns with the screen's right edge but starts below the page header
  useEffect(() => {
    const measure = () => {
      if (rootRef.current) {
        const rect = rootRef.current.getBoundingClientRect();
        setRootTop(Math.max(0, Math.floor(rect.top)));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    // If layout might shift after fonts/Monaco load
    const t = setTimeout(measure, 100);
    return () => {
      window.removeEventListener('resize', measure);
      clearTimeout(t);
    };
  }, []);

  // Load markdown file
  const loadMarkdownFile = async () => {
    try {
      const metadata = await window.electronAPI.file.loadRecording(sessionId);
      setRecordingMetadata(metadata);
      
      if (metadata && metadata.notes) {
        setMarkdownContent(metadata.notes);
        const parsed = parseMarkdownToNotes(metadata.notes, metadata.duration || 0);
        setParsedNotes(parsed);
      } else {
        // Try loading notes.md file directly if metadata.notes is empty
        const defaultContent = '# Recording Notes\n\nNo notes available for this session.';
        setMarkdownContent(defaultContent);
        setParsedNotes([]);
      }
    } catch (error) {
      console.error('Failed to load markdown file:', error);
      const defaultContent = '# Recording Notes\n\nNo notes available for this session.';
      setMarkdownContent(defaultContent);
      setParsedNotes([]);
    }
  };

  // Load audio path
  const loadAudioPath = async () => {
    try {
      // Fix: Use audio.getCompleteAudioPath instead of file.getCompleteAudioPath
      const path = await window.electronAPI.audio.getCompleteAudioPath(sessionId, 'mix');
      if (path) {
        setAudioPath(path);
      }
    } catch (error) {
      console.error('Failed to load audio path:', error);
    }
  };

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
        await window.electronAPI.ai.sendCommand({
          action: 'activate_mcp_server',
          payload: { server_name: selectedMcpServer },
        });
        
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

  // Helper: apply paragraph highlight decorations based on a line number
  const applyParagraphHighlight = (lineNumber: number | null) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current as any;
    if (!editor || !monaco || !lineNumber || parsedNotes.length === 0) return;

    const paragraph = parsedNotes.find(note =>
      lineNumber >= note.lineNumber && lineNumber <= note.endLineNumber
    );

    const model = editor.getModel();
    if (!model) return;

    const decorations = paragraph ? [
      {
        range: new monaco.Range(
          paragraph.lineNumber, 1,
          paragraph.endLineNumber, model.getLineMaxColumn(paragraph.endLineNumber)
        ),
        options: {
          isWholeLine: true,
          className: 'current-paragraph-highlight',
          linesDecorationsClassName: 'current-paragraph-line-decoration',
          glyphMarginClassName: 'current-paragraph-glyph',
          overviewRuler: { color: '#3b82f6', position: monaco.editor.OverviewRulerLane.Left },
          minimap: { color: 'rgba(59,130,246,0.5)', position: monaco.editor.MinimapPosition.Inline }
        }
      }
    ] : [];

    try {
      if (!decorationCollectionRef.current) {
        decorationCollectionRef.current = editor.createDecorationsCollection([]);
      }
      decorationCollectionRef.current.set(decorations);
      // Keep state in sync (optional)
      setDecorationIds((prev) => {
        try { if (prev.length) editor.deltaDecorations(prev, []); } catch {}
        return decorations.length ? editor.deltaDecorations([], decorations) : [];
      });
    } catch (e) {
      console.warn('applyParagraphHighlight failed', e);
    }
  };

  // Track cursor position and update current paragraph
  useEffect(() => {
    if (parsedNotes.length === 0) return;
    
    const paragraph = parsedNotes.find(note => 
      cursorLine >= note.lineNumber && cursorLine <= note.endLineNumber
    );
    
    if (paragraph !== currentParagraph) {
      setCurrentParagraph(paragraph || null);
      if (paragraph) {
        loadScreenshotsForParagraph(paragraph);
      }
    }
  }, [cursorLine, parsedNotes]);

  // Re-apply highlight when notes change or cursor moves (e.g., after initial load)
  useEffect(() => {
    if (!editorRef.current) return;
    applyParagraphHighlight(cursorLine || null);
  }, [parsedNotes, cursorLine]);

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
    
    lines.forEach((line) => {
      if (headingRegex.test(line)) {
        if (currentSection.length > 0) {
          const content = currentSection.join('\n').trim();
          if (content) {
            notes.push({
              content,
              timestamp: currentTimestamp || 0,
              lineNumber: sectionStartLine,
              endLineNumber: currentLineNumber - 1,
              isH1: isH1Section
            });
          }
        }
        
        currentSection = [line];
        sectionStartLine = currentLineNumber;
        isH1Section = h1Regex.test(line);
        
        const tsMatch = line.match(/\[(\d{1,3}):(\d{2})(?::(\d{2}))?\]/);
        if (tsMatch) {
          if (tsMatch[3]) {
            const hours = parseInt(tsMatch[1], 10);
            const minutes = parseInt(tsMatch[2], 10);
            const seconds = parseInt(tsMatch[3], 10);
            currentTimestamp = ((hours * 3600) + (minutes * 60) + seconds) * 1000;
          } else {
            const minutes = parseInt(tsMatch[1], 10);
            const seconds = parseInt(tsMatch[2], 10);
            currentTimestamp = (minutes * 60 + seconds) * 1000;
          }
        } else {
          currentTimestamp = null;
        }
      } else {
        currentSection.push(line);
      }
      
      currentLineNumber++;
    });
    
    if (currentSection.length > 0) {
      const content = currentSection.join('\n').trim();
      if (content) {
        notes.push({
          content,
          timestamp: currentTimestamp || 0,
          lineNumber: sectionStartLine,
          endLineNumber: lines.length,
          isH1: isH1Section
        });
      }
    }
    
    if (notes.length === 0 && markdown.trim()) {
      notes.push({
        content: markdown.trim(),
        timestamp: 0,
        lineNumber: 1,
        endLineNumber: lines.length,
        isH1: false
      });
    }
    
    // Distribute timestamps evenly if not specified
    if (notes.length > 0 && duration > 0) {
      let durationMs = duration;
      const maxReasonableDuration = 10 * 60 * 60 * 1000;
      
      if (duration > 1000000000000) {
        durationMs = Math.floor(duration / 1000000);
      } else if (duration > maxReasonableDuration) {
        durationMs = Math.floor(duration / 1000);
      }
      
      const timePerNote = durationMs / notes.length;
      notes.forEach((note, index) => {
        if (note.timestamp === 0 && index > 0) {
          note.timestamp = Math.floor(index * timePerNote);
        }
      });
    }
    
    return notes;
  };

  const loadScreenshotsForParagraph = async (paragraph: ParsedNote) => {
    setLoadingScreenshots(true);
    setScreenshots([]);
    setSelectedScreenshots(new Set());
    
    try {
      const nextParagraph = parsedNotes.find(n => n.timestamp > paragraph.timestamp);
      const endTimestamp = nextParagraph ? nextParagraph.timestamp : paragraph.timestamp + 60000;
      
      const duration = endTimestamp - paragraph.timestamp;
      const maxScreenshots = 12;
      const minStep = 3000;
      const step = Math.max(minStep, Math.floor(duration / maxScreenshots));
      
      const screenshotPromises: Promise<Screenshot | null>[] = [];
      let currentTs = paragraph.timestamp;
      
      while (currentTs < endTimestamp && screenshotPromises.length < maxScreenshots) {
        const captureTs = currentTs;
        screenshotPromises.push(
          window.electronAPI.file.getScreenshotPath(sessionId, captureTs, 'full')
            .then(path => ({ 
              path, 
              timestamp: captureTs, 
              selected: false 
            }))
            .catch(() => null)
        );
        currentTs += step;
      }

      const results = await Promise.all(screenshotPromises);
      const validScreenshots = results.filter((s): s is Screenshot => s !== null);
      setScreenshots(validScreenshots);
    } catch (error) {
      console.error('Failed to load screenshots:', error);
    } finally {
      setLoadingScreenshots(false);
    }
  };

  const handleEditorMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.updateOptions({
      glyphMargin: true,
      lineDecorationsWidth: 16,
      lineNumbersMinChars: 3,
      folding: false,
      renderLineHighlight: 'all',
      renderLineHighlightOnlyWhenFocus: false
    });

    decorationCollectionRef.current = editor.createDecorationsCollection([]);

    const handleCursorChange = (line: number) => {
      setCursorLine(line);
      applyParagraphHighlight(line);
    };

    editor.onDidChangeCursorPosition((e: any) => handleCursorChange(e.position.lineNumber));
    editor.onDidChangeCursorSelection((e: any) => handleCursorChange(e.selection.positionLineNumber));

    const initialPosition = editor.getPosition();
    if (initialPosition) {
      handleCursorChange(initialPosition.lineNumber);
    } else {
      handleCursorChange(1);
    }
  };

  const handleContentChange = (value: string | undefined) => {
    if (value !== undefined) {
      setMarkdownContent(value);
      const parsed = parseMarkdownToNotes(value, recordingMetadata?.duration || 0);
      setParsedNotes(parsed);
    }
  };

  const toggleScreenshotSelection = (index: number) => {
    const newSelected = new Set(selectedScreenshots);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedScreenshots(newSelected);
  };

  const handleInsertScreenshot = async () => {
    if (!editorRef.current || selectedScreenshots.size === 0) return;
    
    const editor = editorRef.current;
    const position = editor.getPosition();
    if (!position) return;

    const selectedIndices = Array.from(selectedScreenshots).sort((a, b) => a - b);
    let insertText = '\n\n';
    
    for (const index of selectedIndices) {
      const screenshot = screenshots[index];
      if (screenshot) {
        try {
          const fullPath = await window.electronAPI.file.getScreenshotPath(
            sessionId, 
            screenshot.timestamp, 
            'full'
          );
          insertText += `![Screenshot at ${formatTimestamp(screenshot.timestamp)}](file://${fullPath})\n\n`;
        } catch (error) {
          console.error('Failed to get full screenshot:', error);
        }
      }
    }

    editor.executeEdits('insert-screenshots', [{
      range: new monacoRef.current!.Range(
        position.lineNumber, 
        position.column, 
        position.lineNumber, 
        position.column
      ),
      text: insertText,
      forceMoveMarkers: true
    }]);

    setSelectedScreenshots(new Set());
    setMarkdownContent(editor.getModel().getValue());
  };

  const handlePlayAudio = async () => {
    if (!audioPath || !currentParagraph) return;
    
    if (isPlaying) {
      // Stop playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      setIsPlaying(false);
      setCurrentTime(0);
      return;
    }

    try {
      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // Add file:// prefix if not already present
      const audioUrl = audioPath.startsWith('file://') ? audioPath : `file://${audioPath}`;
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      // Calculate end time
      const nextParagraph = parsedNotes.find(n => n.timestamp > currentParagraph.timestamp);
      const endTime = nextParagraph ? nextParagraph.timestamp : currentParagraph.timestamp + 60000;
      const duration = endTime - currentParagraph.timestamp;
      setAudioDuration(duration);
      
      audio.currentTime = currentParagraph.timestamp / 1000;
      await audio.play();
      setIsPlaying(true);
      
      // Update current time
      playbackTimerRef.current = setInterval(() => {
        if (audioRef.current) {
          const elapsed = (audioRef.current.currentTime * 1000) - currentParagraph.timestamp;
          setCurrentTime(elapsed);
          
          if (elapsed >= duration) {
            // Stop at end of paragraph
            audioRef.current.pause();
            audioRef.current = null;
            clearInterval(playbackTimerRef.current!);
            playbackTimerRef.current = null;
            setIsPlaying(false);
            setCurrentTime(0);
            setAudioDuration(0);
          }
        }
      }, 100);
      
    } catch (error) {
      console.error('Failed to play audio:', error);
      setIsPlaying(false);
    }
  };

  const handlePauseAudio = () => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleStopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setAudioDuration(0);
  };

  const handleSeekAudio = (progressPercent: number) => {
    if (!audioRef.current || !currentParagraph) return;
    
    // Calculate the actual time within the paragraph
    const nextParagraph = parsedNotes.find(n => n.timestamp > currentParagraph.timestamp);
    const endTime = nextParagraph ? nextParagraph.timestamp : currentParagraph.timestamp + 60000;
    const duration = endTime - currentParagraph.timestamp;
    
    const newTime = (currentParagraph.timestamp + (duration * progressPercent / 100)) / 1000;
    audioRef.current.currentTime = newTime;
    setCurrentTime((duration * progressPercent / 100));
  };

  const handleSendToAI = async () => {
    if (!aiPrompt.trim() || !currentParagraph) return;
    
    setIsProcessing(true);
    const userMessage = aiPrompt;
    setAiPrompt('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    
    try {
      let response = '';
      
      if (selectedMcpServer && selectedMcpTools.size > 0) {
        // Use MCP with selected tools
        const result = await window.electronAPI.ai.sendCommand({
          action: 'send_mcp_message',
          payload: {
            message: userMessage,
            context: currentParagraph.content,
            tools: Array.from(selectedMcpTools)
          },
        });
        response = result.response || 'No response received';
      } else {
        // Use standard AI
        const result = await (window as any).electronAPI.ai.enhanceNote({
          note: currentParagraph.content,
          prompt: userMessage,
          sessionId: sessionId
        });
        response = result.enhanced || 'No response received';
      }
      
      setChatHistory(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error('AI processing failed:', error);
      const errorMsg = 'Error: Failed to process request';
      setChatHistory(prev => [...prev, { role: 'assistant', content: errorMsg }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTimestamp = (ms: number): string => {
    const validMs = Math.max(0, ms);
    const totalSeconds = Math.floor(validMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleExportMarkdown = async () => {
    try {
      // Create a blob with the markdown content
      const blob = new Blob([markdownContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      
      // Create a download link and click it
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${sessionId}_notes.md`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export markdown:', error);
    }
  };

  // Handle resize for both dividers (stable listeners; do not depend on sectionHeights)
  useEffect(() => {
    const resizeBar1 = resizeRef1.current;
    const resizeBar2 = resizeRef2.current;
    if (!resizeBar1 || !resizeBar2) {
      // If bars aren't mounted (e.g., no current paragraph), skip binding
      return;
    }

    const handleMouseDown1 = (e: MouseEvent) => {
      isResizing1Ref.current = true;
      isResizing2Ref.current = false;
      startYRef.current = e.clientY;
      startHeightsRef.current = { ...sectionHeightsRef.current };
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };

    const handleMouseDown2 = (e: MouseEvent) => {
      isResizing2Ref.current = true;
      isResizing1Ref.current = false;
      startYRef.current = e.clientY;
      startHeightsRef.current = { ...sectionHeightsRef.current };
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing1Ref.current && !isResizing2Ref.current) return;

      const deltaY = e.clientY - startYRef.current;
      const containerHeight = resizeRef1.current?.parentElement?.clientHeight || 600;
      const deltaPercent = (deltaY / containerHeight) * 100;

      if (isResizing1Ref.current) {
        // Resizing between screenshots and MCP
        const start = startHeightsRef.current;
        const newScreenshotsHeight = Math.min(70, Math.max(10, start.screenshots + deltaPercent));
        const totalRemainder = 100 - newScreenshotsHeight;
        const mcpRatio = start.mcp / (start.mcp + start.chat || 1);
        const tentativeMcp = totalRemainder * mcpRatio;
        const newMcpHeight = Math.min(60, Math.max(10, tentativeMcp));
        const newChatHeight = Math.max(10, totalRemainder - newMcpHeight);

        setSectionHeights({
          screenshots: newScreenshotsHeight,
          mcp: newMcpHeight,
          chat: newChatHeight,
        });
      } else if (isResizing2Ref.current) {
        // Resizing between MCP and chat
        const start = startHeightsRef.current;
        const screenshotsHeight = start.screenshots;
        const totalForMcpAndChat = 100 - screenshotsHeight;
        const newMcpHeight = Math.min(60, Math.max(10, start.mcp + deltaPercent));
        const newChatHeight = Math.max(10, totalForMcpAndChat - newMcpHeight);

        setSectionHeights({
          screenshots: screenshotsHeight,
          mcp: newMcpHeight,
          chat: newChatHeight,
        });
      }
    };

    const handleMouseUp = () => {
      if (!isResizing1Ref.current && !isResizing2Ref.current) return;
      isResizing1Ref.current = false;
      isResizing2Ref.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
    };

    resizeBar1.addEventListener('mousedown', handleMouseDown1);
    resizeBar2.addEventListener('mousedown', handleMouseDown2);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      resizeBar1.removeEventListener('mousedown', handleMouseDown1);
      resizeBar2.removeEventListener('mousedown', handleMouseDown2);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarOpen, currentParagraph]);

  return (
    <div ref={rootRef} className="h-full flex bg-gray-900 relative">
      <style>{`
        /* Enhanced paragraph highlighting with prominent left border and background */
        .current-paragraph-highlight {
          background-color: rgba(59, 130, 246, 0.08) !important;
          border-left: 4px solid #3b82f6 !important;
          margin-left: -4px !important;
          padding-left: 4px !important;
        }
        
        /* Left side decoration bar for current paragraph (line decorations column) */
        .current-paragraph-line-decoration {
          background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);
          width: 4px !important;
          margin-left: 2px !important;
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
        }
        
        /* Glyph margin bar at far left */
        .monaco-editor .glyph-margin .current-paragraph-glyph {
          background: #3b82f6 !important;
          width: 4px !important;
          height: 100%;
          border-radius: 2px;
          margin-left: 2px;
          box-shadow: 0 0 6px rgba(59,130,246,0.6);
        }
        
        /* Background highlighting for each line in the paragraph */
        .monaco-editor .view-lines .current-paragraph-highlight {
          background-color: rgba(59, 130, 246, 0.06) !important;
          position: relative;
        }
        
        /* Add a subtle animation for when paragraph changes */
        .monaco-editor .view-lines .current-paragraph-highlight::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: #3b82f6;
          animation: highlightPulse 2s ease-in-out infinite;
        }
        
        @keyframes highlightPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        
        /* Ensure the highlight is visible in the gutter area */
        .monaco-editor .margin-view-overlays .current-paragraph-line-decoration {
          background: #3b82f6 !important;
          border-radius: 2px;
        }
        .resize-bar {
          position: relative;
          height: 4px;
          background: linear-gradient(to bottom, #374151, #1f2937);
          cursor: ns-resize;
          transition: all 0.2s ease;
          z-index: 10;
        }
        .resize-bar:hover {
          background: linear-gradient(to bottom, #3b82f6, #2563eb);
          height: 6px;
          margin: -1px 0;
        }
        .resize-bar::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 30px;
          height: 2px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 1px;
        }
        .resize-bar:hover::before {
          background: rgba(255, 255, 255, 0.6);
        }
      `}</style>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 p-4 border-b border-gray-700">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-semibold text-white">Review Session</h1>
              <p className="text-sm text-gray-400 mt-1">Session ID: {sessionId}</p>
            </div>
            {/* Toggle button moved to a floating control to ensure visibility */}
          </div>
        </div>

        {/* Monaco Editor with Preview Toggle */}
        <div className="flex-1 p-4">
          <div className="h-full bg-gray-800 rounded-lg overflow-hidden flex flex-col">
            {/* Preview Mode Toggle Button */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-700 border-b border-gray-600">
              <h3 className="text-sm font-medium text-gray-200">
                {isPreviewMode ? 'Preview Mode' : 'Edit Mode'}
              </h3>
              <button
                onClick={() => setIsPreviewMode(!isPreviewMode)}
                className="flex items-center gap-2 px-3 py-1 text-sm bg-gray-600 hover:bg-gray-500 text-gray-200 rounded transition-colors"
                title={`${isPreviewMode ? 'Switch to Edit Mode' : 'Switch to Preview Mode'} (Ctrl+Shift+P)`}
              >
                {isPreviewMode ? (
                  <>
                    <Edit size={16} />
                    <span>Edit</span>
                  </>
                ) : (
                  <>
                    <Eye size={16} />
                    <span>Preview</span>
                  </>
                )}
              </button>
            </div>
            
            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
              {isPreviewMode ? (
                /* Markdown Preview */
                <div className="h-full overflow-y-auto p-6 prose prose-invert prose-sm max-w-none
                  prose-headings:text-gray-200 prose-p:text-gray-300 prose-strong:text-gray-200
                  prose-em:text-gray-300 prose-code:text-blue-300 prose-code:bg-gray-700
                  prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700
                  prose-blockquote:border-gray-600 prose-blockquote:text-gray-400
                  prose-hr:border-gray-600 prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                  prose-ul:text-gray-300 prose-ol:text-gray-300 prose-li:text-gray-300
                  prose-table:text-gray-300 prose-th:text-gray-200 prose-td:text-gray-300
                  prose-th:border-gray-600 prose-td:border-gray-700">
                  <ReactMarkdown>{markdownContent}</ReactMarkdown>
                </div>
              ) : (
                /* Monaco Editor */
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
                    minimap: { enabled: true },
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    padding: { top: 10, bottom: 10 },
                    lineHeight: 21,
                    renderLineHighlight: 'all',
                    renderLineHighlightOnlyWhenFocus: false,
                    contextmenu: true,
                    overviewRulerLanes: 3,
                    overviewRulerBorder: false
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating single toggle button (always visible) */}
      <div
        className="fixed z-40 transition-all duration-200 ease-out"
        style={{ top: rootTop + 12, right: `calc(${sidebarOpen ? '24rem' : '0px'} + 8px)` }}
      >
        <button
          onClick={() => setSidebarOpen(prev => !prev)}
          className="text-gray-200 bg-gray-800/90 hover:bg-gray-700 border border-gray-700 rounded p-2 shadow-md transition-colors"
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Sidebar */}
      <div
        className="fixed right-0 bg-gray-800 border-l border-gray-700 flex flex-col overflow-hidden transition-all duration-200 ease-out z-30"
        style={{ top: rootTop, height: `calc(100vh - ${rootTop}px)`, width: sidebarOpen ? '24rem' : '0px', willChange: 'width' }}
      >
        {sidebarOpen && (
          <>
            {/* Sidebar Header */}
            <div className="p-4 border-b border-gray-700">
              <div className="flex justify-between items-start">
                <h2 className="text-lg font-semibold text-white">
                  {currentParagraph ? (
                    <>
                      Paragraph at Line {currentParagraph.lineNumber}
                      {currentParagraph.timestamp > 0 && (
                        <span className="text-sm text-gray-400 ml-2">
                          [{formatTimestamp(currentParagraph.timestamp)}]
                        </span>
                      )}
                    </>
                  ) : (
                    'No paragraph selected'
                  )}
                </h2>
                <button
                  onClick={handleExportMarkdown}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-medium transition-colors"
                  title="Export markdown"
                >
                  <Download size={14} />
                  <span>Export</span>
                </button>
              </div>
            </div>

            {currentParagraph && (
              <>
                {/* Screenshots and Audio Controls Section */}
                <div 
                  className="flex flex-col overflow-hidden"
                  style={{ height: `${sectionHeights.screenshots}%` }}
                >
                  {/* Time Range Display */}
                  <div className="px-4 py-2 bg-gray-900 text-sm text-gray-400">
                    Time range: {formatTimestamp(currentParagraph.timestamp)} - {
                      (() => {
                        const next = parsedNotes.find(n => n.timestamp > currentParagraph.timestamp);
                        return next ? formatTimestamp(next.timestamp) : 'End';
                      })()
                    }
                  </div>

                  {/* Screenshots Gallery */}
                  <div className="flex-1 overflow-y-auto p-4">
                    {loadingScreenshots ? (
                      <div className="text-center text-gray-400 py-8">Loading screenshots...</div>
                    ) : screenshots.length > 0 ? (
                      <div className="space-y-4">
                        <div className="text-sm text-gray-400">
                          Click to select, double-click to preview:
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {screenshots.map((screenshot, index) => (
                            <div
                              key={index}
                              className="relative cursor-pointer group"
                              onClick={() => setPreviewScreenshot(screenshot.path)}
                              title="Click to view full size"
                            >
                              <img
                                src={`file://${screenshot.path}`}
                                alt={`Screenshot at ${formatTimestamp(screenshot.timestamp)}`}
                                className="w-full h-24 object-cover rounded border-2 transition-all border-gray-600 hover:border-blue-500"
                              />
                              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs px-1 py-0.5 text-center">
                                {formatTimestamp(screenshot.timestamp - currentParagraph.timestamp)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        No screenshots available for this section
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="p-4 border-t border-gray-700 space-y-2">
                    <button
                      onClick={handleInsertScreenshot}
                      disabled={selectedScreenshots.size === 0}
                      className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
                        selectedScreenshots.size > 0
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <Camera size={16} />
                      <span>Insert {selectedScreenshots.size || ''} Screenshot{selectedScreenshots.size !== 1 ? 's' : ''}</span>
                    </button>

                    {/* Audio Controls */}
                    <div className="space-y-3">
                      {/* Progress Bar */}
                      {(isPlaying || currentTime > 0) && audioDuration > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>{formatTimestamp(currentTime)}</span>
                            <span>{formatTimestamp(audioDuration)}</span>
                          </div>
                          <div 
                            ref={progressBarRef}
                            className="relative h-2 bg-gray-700 rounded-full overflow-hidden cursor-pointer group"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setIsDraggingProgress(true);
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const percentage = (x / rect.width) * 100;
                              handleSeekAudio(Math.max(0, Math.min(100, percentage)));
                            }}
                            onMouseMove={(e) => {
                              if (isDraggingProgress) {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const x = e.clientX - rect.left;
                                const percentage = (x / rect.width) * 100;
                                handleSeekAudio(Math.max(0, Math.min(100, percentage)));
                              }
                            }}
                            onMouseUp={() => {
                              setIsDraggingProgress(false);
                            }}
                            onMouseLeave={() => {
                              setIsDraggingProgress(false);
                            }}
                          >
                            <div
                              className="absolute left-0 top-0 h-full bg-blue-500 pointer-events-none"
                              style={{ 
                                width: `${audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0}%`,
                                transition: isDraggingProgress ? 'none' : 'width 100ms'
                              }}
                            />
                            {/* Hover indicator */}
                            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 pointer-events-none" />
                            {/* Drag handle - visible on hover or when dragging */}
                            <div 
                              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ 
                                left: `calc(${audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0}% - 6px)`,
                                opacity: isDraggingProgress ? 1 : undefined
                              }}
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Control Buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={handlePlayAudio}
                          disabled={!audioPath || !currentParagraph}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
                            audioPath && currentParagraph
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <Play size={16} />
                          <span>Play</span>
                        </button>
                        <button
                          onClick={handlePauseAudio}
                          disabled={!isPlaying}
                          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                            isPlaying
                              ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <Pause size={16} />
                        </button>
                        <button
                          onClick={handleStopAudio}
                          disabled={!isPlaying && currentTime === 0}
                          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                            isPlaying || currentTime > 0
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <Square size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* First Resize Bar - Between Screenshots and MCP */}
                <div
                  ref={resizeRef1}
                  className="resize-bar"
                  title="Drag to resize sections"
                />

                {/* MCP Settings Section */}
                <div 
                  className="flex flex-col overflow-hidden"
                  style={{ height: `${sectionHeights.mcp}%` }}
                >
                  <div className="p-4 h-full overflow-y-auto">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">MCP Server</label>
                        <select
                          value={selectedMcpServer}
                          onChange={(e) => setSelectedMcpServer(e.target.value)}
                          className="w-full bg-gray-700 text-white px-3 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
                        >
                          <option value="">Standard AI (No MCP)</option>
                          {mcpServers.map((server: any) => (
                            <option key={server.name} value={server.name}>
                              {server.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedMcpServer && mcpTools.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-sm text-gray-400">
                              Available Functions ({mcpTools.filter(t => selectedMcpTools.has(t.name)).length}/{mcpTools.length} selected)
                            </label>
                            <button
                              onClick={() => setMcpToolsExpanded(!mcpToolsExpanded)}
                              className="text-gray-400 hover:text-white transition-colors"
                              title={mcpToolsExpanded ? 'Collapse' : 'Expand'}
                            >
                              {mcpToolsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                          
                          {mcpToolsExpanded && (
                            <>
                              <div className="flex gap-2 mb-2">
                                <button
                                  onClick={() => {
                                    const allTools = new Set(mcpTools.map((t: any) => t.name));
                                    setSelectedMcpTools(allTools);
                                  }}
                                  className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 rounded transition-colors"
                                >
                                  Select All
                                </button>
                                <button
                                  onClick={() => setSelectedMcpTools(new Set())}
                                  className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 rounded transition-colors"
                                >
                                  Select None
                                </button>
                              </div>
                              
                              <div className="max-h-24 overflow-y-auto bg-gray-900 rounded p-2 space-y-1">
                                {mcpTools.map((tool: any) => (
                                  <label key={tool.name} className="flex items-center text-sm text-gray-300 cursor-pointer hover:text-white">
                                    <input
                                      type="checkbox"
                                      checked={selectedMcpTools.has(tool.name)}
                                      onChange={(e) => {
                                        const newSelected = new Set(selectedMcpTools);
                                        if (e.target.checked) {
                                          newSelected.add(tool.name);
                                        } else {
                                          newSelected.delete(tool.name);
                                        }
                                        setSelectedMcpTools(newSelected);
                                      }}
                                      className="mr-2"
                                    />
                                    {tool.name}
                                  </label>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Second Resize Bar - Between MCP and Chat */}
                <div
                  ref={resizeRef2}
                  className="resize-bar"
                  title="Drag to resize sections"
                />

                {/* Chat Section */}
                <div 
                  className="flex flex-col overflow-hidden"
                  style={{ height: `${sectionHeights.chat}%` }}
                >
                  {/* Chat History */}
                  <div className="flex-1 overflow-y-auto p-4">
                    {chatHistory.length > 0 ? (
                      <div className="space-y-3">
                        {chatHistory.map((msg, index) => (
                          <div key={index} className={`${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                            <div className={`inline-block max-w-[80%] p-3 rounded-lg ${
                              msg.role === 'user' 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-700 text-gray-100'
                            }`}>
                              <div className="text-xs opacity-75 mb-1">
                                {msg.role === 'user' ? 'You' : 'AI'}
                              </div>
                              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                            </div>
                          </div>
                        ))}
                        {isProcessing && (
                          <div className="text-left">
                            <div className="inline-block bg-gray-700 text-gray-100 p-3 rounded-lg">
                              <div className="text-sm">Processing...</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        Start a conversation about this paragraph
                      </div>
                    )}
                  </div>

                  {/* Input Area */}
                  <div className="p-4 border-t border-gray-700">
                    <div className="flex gap-2">
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendToAI();
                          }
                        }}
                        placeholder="Ask about this paragraph..."
                        className="flex-1 bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none resize-none text-sm"
                        rows={2}
                        disabled={isProcessing || !currentParagraph}
                      />
                    </div>
                    <button
                      onClick={handleSendToAI}
                      disabled={isProcessing || !aiPrompt.trim() || !currentParagraph}
                      className={`mt-2 w-full px-4 py-2 rounded font-medium transition-colors text-sm ${
                        isProcessing || !aiPrompt.trim() || !currentParagraph
                          ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isProcessing ? 'Processing...' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {!currentParagraph && (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                Move cursor to a paragraph to view details
              </div>
            )}
          </>
        )}
      </div>

      {/* Enhanced Screenshot Preview Modal with Zoom and Copy */}
      {previewScreenshot && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-50">
          {/* Control bar */}
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-gray-800 rounded-lg px-4 py-2 flex items-center space-x-3 z-10">
            {/* Zoom controls */}
            <button
              onClick={() => setZoomLevel(prev => Math.max(prev - 0.25, 0.5))}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              title="Zoom Out (-)">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
              </svg>
            </button>
            
            <span className="text-white text-sm min-w-[60px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            
            <button
              onClick={() => setZoomLevel(prev => Math.min(prev + 0.25, 3))}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              title="Zoom In (+)">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
              </svg>
            </button>
            
            <div className="w-px h-6 bg-gray-600"></div>
            
            {/* Reset zoom */}
            <button
              onClick={() => setZoomLevel(1)}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              title="Reset Zoom (100%)">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            
            <div className="w-px h-6 bg-gray-600"></div>
            
            {/* Copy image */}
            <button
              onClick={async () => {
                try {
                  const img = new Image();
                  img.crossOrigin = 'anonymous';
                  
                  await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = `file://${previewScreenshot}`;
                  });

                  const canvas = document.createElement('canvas');
                  canvas.width = img.naturalWidth;
                  canvas.height = img.naturalHeight;
                  const ctx = canvas.getContext('2d');
                  if (!ctx) throw new Error('Failed to get canvas context');
                  ctx.drawImage(img, 0, 0);

                  canvas.toBlob(async (blob) => {
                    if (!blob) throw new Error('Failed to create blob');
                    
                    try {
                      await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                      ]);
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    } catch (err) {
                      console.error('Failed to copy image to clipboard:', err);
                    }
                  }, 'image/png');
                } catch (error) {
                  console.error('Failed to copy image:', error);
                }
              }}
              className={`p-2 rounded transition-colors ${
                copySuccess 
                  ? 'bg-green-600 hover:bg-green-500' 
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
              title={copySuccess ? "Copied!" : "Copy Image"}>
              {copySuccess ? (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            
            <div className="w-px h-6 bg-gray-600"></div>
            
            {/* Close button */}
            <button
              onClick={() => {
                setPreviewScreenshot(null);
                setZoomLevel(1);
              }}
              className="p-2 bg-red-600 hover:bg-red-500 rounded transition-colors"
              title="Close (ESC)">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Image container */}
          <div 
            className="relative overflow-auto max-w-full max-h-full p-8"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setPreviewScreenshot(null);
                setZoomLevel(1);
              }
            }}>
            <img 
              src={`file://${previewScreenshot}`}
              alt="Full-size screenshot"
              className="object-contain cursor-move"
              style={{
                transform: `scale(${zoomLevel})`,
                transition: 'transform 0.2s ease-in-out',
                maxWidth: '90vw',
                maxHeight: '85vh'
              }}
              draggable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
};