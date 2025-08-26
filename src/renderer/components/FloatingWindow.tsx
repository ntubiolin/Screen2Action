import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useRecordingStore } from '../store/recordingStore';
import { FloatingAIWindow } from './FloatingAIWindow';

interface FloatingWindowProps {
  onExpand: (sessionId?: string, notes?: string) => void;
  onClose: () => void;
}

export const FloatingWindow: React.FC<FloatingWindowProps> = ({ onExpand, onClose }) => {
  const [isRecording, setIsRecording] = useState(false);
  const isMacOS = navigator.platform.toLowerCase().includes('mac');
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
  const [selectedScreen, setSelectedScreen] = useState<string>('');
  const [sources, setSources] = useState<any[]>([]);
  const [conversionMessage, setConversionMessage] = useState<string>('');
  
  // AI Window state
  const [showAIWindow, setShowAIWindow] = useState(false);
  const [aiScreenshotPath, setAIScreenshotPath] = useState<string | null>(null);
  const [aiCommand, setAICommand] = useState<string>('');
  const [triggerLineNumber, setTriggerLineNumber] = useState<number | null>(null);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const headingTsRef = useRef<Record<string, number>>({});
  const prevHeadingKeysRef = useRef<string[]>([]);
  const contentWidgetsRef = useRef<any[]>([]);
  const decorationIdsRef = useRef<string[]>([]);
  
  const { addNote, clearNotes, setRecordingDuration } = useRecordingStore();
  
  // Heading detection regex
  const headingLineRegex = /^#{1,6}\s+/;
  
  // AI trigger detection regex
  const aiTriggerRegex = /^!!!(.*)$/;

  // Load screen sources on mount
  useEffect(() => {
    loadSources();
  }, []);

  // Timer for recording duration and screenshot count update
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const newTime = prev + 1;
          // Update screenshot count approximately every 10 seconds
          // Backend captures screenshots periodically
          if (newTime > 0 && newTime % 10 === 0) {
            setScreenshotCount((prevCount) => prevCount + 1);
          }
          return newTime;
        });
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

  // Listen for audio conversion complete event
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

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatMMSS = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const nowRelativeMs = () => Math.max(0, Date.now() - recordingStartTimeRef.current);

  // Build stable keys for headings
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
    updateHeadingWidgets();
  };

  const handleStartRecording = async () => {
    if (!selectedScreen) {
      // If no screen selected, try to use the first available one
      if (sources.length === 0) {
        await loadSources();
      }
      if (sources.length > 0 && !selectedScreen) {
        setSelectedScreen(sources[0].id);
      }
    }
    
    const screenToRecord = selectedScreen || (sources.length > 0 ? sources[0].id : '');
    if (!screenToRecord) {
      alert('No screen available to record');
      return;
    }

    try {
      // Send audio device preferences if configured
      if (audioTracking.mic || audioTracking.system) {
        try {
          await window.electronAPI.ai.sendCommand({ 
            action: 'select_audio_devices', 
            mic: audioTracking.mic ? 'default' : '', 
            system: audioTracking.system ? 'default' : '' 
          });
        } catch (e) { 
          console.warn('Failed to send audio device preferences', e); 
        }
      }

      // Start recording via backend API
      const newSessionId = await window.electronAPI.recording.start(screenToRecord);
      setSessionId(newSessionId);
      
      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);
      setIsReadOnly(false);
      setRecordingTime(0);
      setScreenshotCount(1); // Start with 1 since backend takes initial screenshot
      clearNotes();
      
      // Initialize heading timestamp baseline
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

  const handleStopRecording = async () => {
    try {
      // Stop recording via backend API
      const stopResult = await window.electronAPI.recording.stop();
      setIsRecording(false);
      setIsReadOnly(true);
      
      if (stopResult?.duration) {
        setRecordingDuration(stopResult.duration);
      }
      
      if (sessionId) {
        // Save markdown notes to file
        if (notes.trim()) {
          try {
            await window.electronAPI.file.saveMarkdown(sessionId, notes);
            console.log('Markdown notes saved successfully');
          } catch (error) {
            console.error('Failed to save markdown notes:', error);
          }
        }
        
        // Parse notes into sections using the same logic as RecordingPage
        const rawLines = notes.split('\n');
        const sections: { headingKey: string | null; text: string }[] = [];
        let current: string[] = [];
        let currentKey: string | null = null;

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

        // Parse and add notes to store with timestamps
        noteEntries.forEach((entry, index) => {
          // Priority 1: In-memory heading timestamp
          let timestamp: number | null = null;
          if (entry.headingKey && headingTsRef.current[entry.headingKey] != null) {
            timestamp = headingTsRef.current[entry.headingKey];
          }

          // Priority 2: [MM:SS] prefix
          if (timestamp === null) {
            const tsMatch = entry.text.match(/^#{0,6}\s*\[(\d{2}):(\d{2})\]\s*([\s\S]*)/);
            if (tsMatch) {
              const minutes = parseInt(tsMatch[1], 10);
              const seconds = parseInt(tsMatch[2], 10);
              timestamp = (minutes * 60 + seconds) * 1000;
            }
          }

          // Priority 3: Even distribution
          if (timestamp === null) {
            const denom = Math.max(noteEntries.length - 1, 1);
            timestamp = Math.floor((index / denom) * durationMs);
          }

          // Clean content
          let content = entry.text
            .replace(/^(#{0,6})(\s*)\[(\d{2}):(\d{2})\]\s*/, (_m, hashes) => (hashes ? `${hashes} ` : ''))
            .trim();

          addNote({ content, timestamp });
        });
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
      }
    } catch (error) {
      console.error('Failed to select output path:', error);
    }
  };

  // Detect and handle AI trigger (!!!)
  const detectAITrigger = (text: string) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    
    const lines = text.split('\n');
    const newDecorationIds: string[] = [];
    let foundTrigger = false;
    
    lines.forEach((line, index) => {
      const match = line.match(aiTriggerRegex);
      if (match) {
        const lineNumber = index + 1;
        const command = match[1].trim();
        
        // Highlight the !!! in red
        const decoration = {
          range: new monaco.Range(lineNumber, 1, lineNumber, 4),
          options: {
            inlineClassName: 'ai-trigger-highlight'
          }
        };
        
        const decorationId = editor.deltaDecorations([], [decoration])[0];
        newDecorationIds.push(decorationId);
        
        // Store the trigger line and command
        if (!isCapturingScreenshot && !foundTrigger) {
          setTriggerLineNumber(lineNumber);
          setAICommand(command);
          foundTrigger = true;
        }
      }
    });
    
    // Clear trigger state if no trigger found
    if (!foundTrigger && !isCapturingScreenshot) {
      setTriggerLineNumber(null);
      setAICommand('');
    }
    
    // Clear old decorations and apply new ones
    if (decorationIdsRef.current.length > 0) {
      editor.deltaDecorations(decorationIdsRef.current, []);
    }
    decorationIdsRef.current = newDecorationIds;
  };
  
  // Handle screenshot capture with command passed directly
  const handleScreenshotCaptureWithCommand = async (lineNumber: number, command: string) => {
    console.log('handleScreenshotCaptureWithCommand called:', { lineNumber, command, isCapturingScreenshot });
    
    if (isCapturingScreenshot || lineNumber === null) {
      console.log('Skipping capture:', { isCapturingScreenshot, lineNumber });
      return;
    }
    
    setIsCapturingScreenshot(true);
    try {
      // Create user_screenshots directory path with timestamp
      const now = new Date();
      const timestamp = `${now.getFullYear().toString().slice(-2)}_${
        (now.getMonth() + 1).toString().padStart(2, '0')}_${
        now.getDate().toString().padStart(2, '0')}_${
        now.getHours().toString().padStart(2, '0')}_${
        now.getMinutes().toString().padStart(2, '0')}_${
        now.getSeconds().toString().padStart(2, '0')}`;
      
      console.log('Capturing screenshot with timestamp:', timestamp);
      
      // Capture screenshot
      const screenshotId = await window.electronAPI.screenshot.capture({ 
        fullScreen: true,
        userInitiated: true,
        filename: `user_screenshot_${timestamp}.png`
      });
      
      // Get the screenshot path
      const screenshotPath = await window.electronAPI.screenshot.save(
        screenshotId, 
        `user_screenshots/user_screenshot_${timestamp}.png`
      );
      
      console.log('Screenshot saved:', screenshotPath);
      setAIScreenshotPath(screenshotPath);
      
      // Check if there's a command (anything after !!!)
      // Show AI window if there's any text
      if (command && command.length > 0) {
        console.log('Showing AI window with command:', command);
        setShowAIWindow(true);
      } else {
        console.log('No command, inserting screenshot directly');
        // No command, directly insert screenshot into markdown
        insertScreenshotIntoMarkdown(screenshotPath, lineNumber);
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      // Reset trigger state on error
      setTriggerLineNumber(null);
      setAICommand('');
    } finally {
      setIsCapturingScreenshot(false);
    }
  };
  
  // Handle screenshot capture (for backward compatibility if needed)
  const handleScreenshotCapture = async () => {
    console.log('handleScreenshotCapture called:', { triggerLineNumber, aiCommand, isCapturingScreenshot });
    
    if (isCapturingScreenshot || triggerLineNumber === null) {
      console.log('Skipping capture:', { isCapturingScreenshot, triggerLineNumber });
      return;
    }
    
    setIsCapturingScreenshot(true);
    try {
      // Create user_screenshots directory path with timestamp
      const now = new Date();
      const timestamp = `${now.getFullYear().toString().slice(-2)}_${
        (now.getMonth() + 1).toString().padStart(2, '0')}_${
        now.getDate().toString().padStart(2, '0')}_${
        now.getHours().toString().padStart(2, '0')}_${
        now.getMinutes().toString().padStart(2, '0')}_${
        now.getSeconds().toString().padStart(2, '0')}`;
      
      console.log('Capturing screenshot with timestamp:', timestamp);
      
      // Capture screenshot
      const screenshotId = await window.electronAPI.screenshot.capture({ 
        fullScreen: true,
        userInitiated: true,
        filename: `user_screenshot_${timestamp}.png`
      });
      
      // Get the screenshot path
      const screenshotPath = await window.electronAPI.screenshot.save(
        screenshotId, 
        `user_screenshots/user_screenshot_${timestamp}.png`
      );
      
      console.log('Screenshot saved:', screenshotPath);
      setAIScreenshotPath(screenshotPath);
      
      // Check if there's a command (anything after !!!)
      // Show AI window if there's any text, even just for viewing the screenshot
      if (aiCommand && aiCommand.length > 0) {
        console.log('Showing AI window with command:', aiCommand);
        setShowAIWindow(true);
      } else {
        console.log('No command, inserting screenshot directly');
        // No command, directly insert screenshot into markdown
        insertScreenshotIntoMarkdown(screenshotPath, lineNumber);
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      // Reset trigger state on error
      setTriggerLineNumber(null);
      setAICommand('');
    } finally {
      setIsCapturingScreenshot(false);
    }
  };
  
  // Insert screenshot into markdown editor
  const insertScreenshotIntoMarkdown = (screenshotPath: string, lineNumber?: number) => {
    const editor = editorRef.current;
    const targetLine = lineNumber ?? triggerLineNumber;
    if (!editor || targetLine === null) return;
    
    const model = editor.getModel();
    if (!model) return;
    
    // Create markdown image syntax
    const markdownImage = `![Screenshot](file://${screenshotPath})`;
    
    // Replace the trigger line with the image
    const range = {
      startLineNumber: targetLine,
      startColumn: 1,
      endLineNumber: targetLine,
      endColumn: model.getLineMaxColumn(targetLine)
    };
    
    editor.executeEdits('ai-screenshot', [{
      range,
      text: markdownImage
    }]);
    
    // Clear trigger state
    setTriggerLineNumber(null);
    setAICommand('');
  };
  
  // Handle potential AI trigger on content change
  const checkForAITriggerOnEnter = (editor: any, changes: any) => {
    // Check if Enter key was pressed
    const hasEnter = changes.some((change: any) => 
      change.text.includes('\n')
    );
    
    if (!hasEnter) return;
    
    const position = editor.getPosition();
    if (!position) return;
    
    const model = editor.getModel();
    if (!model) return;
    
    // Check the previous line (before the new line)
    const previousLineNumber = position.lineNumber - 1;
    if (previousLineNumber < 1) return;
    
    const previousLineContent = model.getLineContent(previousLineNumber);
    const match = previousLineContent.match(aiTriggerRegex);
    
    if (match) {
      // We found a trigger on the previous line
      const command = match[1] ? match[1].trim() : '';
      console.log('AI trigger detected:', { line: previousLineNumber, command });
      
      // Set the trigger state
      setTriggerLineNumber(previousLineNumber);
      setAICommand(command);
      
      // Pass the command directly to avoid stale closure issues
      setTimeout(() => {
        handleScreenshotCaptureWithCommand(previousLineNumber, command);
      }, 50);
    }
  };
  
  // Copy screenshot to clipboard
  const handleCopyScreenshot = async (screenshotPath: string) => {
    try {
      // Extract the screenshot ID from the path if needed
      await window.electronAPI.screenshot.copy(screenshotPath);
    } catch (error) {
      console.error('Failed to copy screenshot:', error);
    }
  };
  
  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    updateHeadingWidgets();
    
    // Initialize prev keys so only new headings get timestamps while recording
    try { updateHeadingTimestamps(notes || ''); } catch {}
    
    editor.onDidChangeModelContent((e: any) => {
      const content = editor.getValue();
      updateHeadingTimestamps(content);
      detectAITrigger(content);
      
      // Check for AI trigger when Enter is pressed
      checkForAITriggerOnEnter(editor, e.changes);
    });
    
    // Don't override the Enter key - let Monaco handle it normally
    // We'll detect the trigger through content changes instead
    
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
    <>
      {/* Inject styles for timestamp chips and AI trigger */}
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
        .ai-trigger-highlight {
          color: #ef4444 !important;
          font-weight: bold;
        }
      `}</style>
      
      {/* Audio conversion message */}
      {conversionMessage && (
        <div style={{
          position: 'absolute',
          top: '45px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 12px',
          background: 'rgba(55, 65, 81, 0.95)',
          color: '#e5e7eb',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>🎵</span>
          <span>{conversionMessage}</span>
        </div>
      )}
      
      <div className="floating-window" style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#1f2937',
      borderRadius: '8px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      border: '1px solid rgba(75, 85, 99, 0.5)',
      overflow: 'hidden'
    }}>
      {/* Top Toolbar - Make it draggable */}
      <div className="toolbar" style={{
        height: '40px',
        padding: '8px',
        paddingLeft: isMacOS ? '80px' : '8px', // Add padding for macOS traffic lights
        borderBottom: '1px solid rgba(75, 85, 99, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
        WebkitAppRegion: 'drag',  // Makes the toolbar draggable on macOS/Windows
        userSelect: 'none'
      } as React.CSSProperties}>
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
              fontSize: '12px',
              WebkitAppRegion: 'no-drag'  // Make button clickable
            } as React.CSSProperties}
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
              fontSize: '12px',
              WebkitAppRegion: 'no-drag'
            } as React.CSSProperties}
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
              fontSize: '16px',
              WebkitAppRegion: 'no-drag'
            } as React.CSSProperties}
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
            padding: '0 4px',
            WebkitAppRegion: 'no-drag'
          } as React.CSSProperties}
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
            textOrientation: 'mixed',
            WebkitAppRegion: 'no-drag'
          } as React.CSSProperties}
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
            onClick={() => onExpand(sessionId || undefined)}
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
    
    {/* Floating AI Window */}
    <FloatingAIWindow
      isVisible={showAIWindow}
      onToggle={() => setShowAIWindow(!showAIWindow)}
      screenshotPath={aiScreenshotPath}
      command={aiCommand}
      onInsertScreenshot={insertScreenshotIntoMarkdown}
      onCopyScreenshot={handleCopyScreenshot}
    />
    </>
  );
};