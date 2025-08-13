import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useRecordingStore } from '../store/recordingStore';

interface ReviewPageProps {
  sessionId: string;
}

interface MultiScreenshotDisplayProps {
  sessionId: string;
  startTime: number;
  endTime: number;
}

const MultiScreenshotDisplay: React.FC<MultiScreenshotDisplayProps> = ({ sessionId, startTime, endTime }) => {
  const [screenshots, setScreenshots] = useState<Array<{path: string; timestamp: number}>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  React.useEffect(() => {
    const loadScreenshots = async () => {
      try {
        const screenshotsData = await window.electronAPI.file.getScreenshotsInRange(sessionId, startTime, endTime, 'thumb');
        setScreenshots(screenshotsData);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load screenshots:', err);
        setError(true);
        setLoading(false);
      }
    };

    loadScreenshots();
  }, [sessionId, startTime, endTime]);

  if (loading) {
    return (
      <div className="bg-gray-900 rounded p-2 flex items-center justify-center min-h-[100px]">
        <div className="text-gray-600 text-sm">Loading screenshots...</div>
      </div>
    );
  }

  if (error || screenshots.length === 0) {
    return (
      <div className="bg-gray-900 rounded p-2 flex items-center justify-center min-h-[100px]">
        <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} 
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex space-x-3">
      {screenshots.map((screenshot, idx) => (
        <div key={idx} className="flex-shrink-0 bg-gray-900 rounded overflow-hidden w-32 h-20">
          <img 
            src={`file://${screenshot.path}`} 
            alt={`Screenshot at ${screenshot.timestamp}ms`}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      ))}
      {screenshots.length === 0 && (
        <div className="text-xs text-gray-500">No screenshots in range</div>
      )}
    </div>
  );
};

export const ReviewPage: React.FC<ReviewPageProps> = ({ sessionId }) => {
  const [selectedNote, setSelectedNote] = useState<number>(0);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [outputPath, setOutputPath] = useState<string>('');
  const [audioPath, setAudioPath] = useState<string>('');
  const [audioError, setAudioError] = useState<string>('');
  const [mcpServers, setMcpServers] = useState<Array<any>>([]);
  const [selectedMcpServer, setSelectedMcpServer] = useState<string>('');
  const [mcpTools, setMcpTools] = useState<Array<any>>([]);
  const [showMcpDropdown, setShowMcpDropdown] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [pausedIndex, setPausedIndex] = useState<number | null>(null);
  const [audioProgress, setAudioProgress] = useState<{ [key: number]: number }>({});
  const [segmentStartTimes, setSegmentStartTimes] = useState<{ [key: number]: number }>({});
  const [segmentDurations, setSegmentDurations] = useState<{ [key: number]: number }>({});
  const [isDragging, setIsDragging] = useState<number | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const progressBarRefs = React.useRef<{ [key: number]: HTMLDivElement | null }>({});
  
  const { notes, recordingDuration } = useRecordingStore();

  const LAST_NOTE_PADDING_MS = 1000; // small padding for final segment

  // Load MCP servers on mount
  React.useEffect(() => {
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
    loadMcpServers();
  }, []);

  // Load MCP tools when server is selected
  React.useEffect(() => {
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

  // Get output folder path and audio path on mount
  React.useEffect(() => {
    let cancelled = false;

    const loadOutputPath = async () => {
      try {
        const metadata = await window.electronAPI.file.loadRecording(sessionId);
        if (!cancelled) {
          if (metadata?.sessionPath) {
            setOutputPath(metadata.sessionPath);
          } else {
            const defaultPath = `recordings/${sessionId}`;
            setOutputPath(defaultPath);
          }
        }
      } catch (error) {
        console.error('Failed to load output path:', error);
        if (!cancelled) {
          const defaultPath = `recordings/${sessionId}`;
            setOutputPath(defaultPath);
        }
      }
    };

    const loadAudioWithRetry = async (attempt = 0) => {
      try {
        const path = await window.electronAPI.audio.getCompleteAudioPath(sessionId, 'mix');
        if (!cancelled) {
          setAudioPath(`file://${path}`);
          setAudioError('');
        }
      } catch (error: any) {
        if (attempt < 10) { // retry up to ~5s (10 * 500ms)
          setTimeout(() => loadAudioWithRetry(attempt + 1), 500);
        } else if (!cancelled) {
          setAudioError(error.message || 'Audio file not found');
        }
      }
    };

    loadOutputPath();
    loadAudioWithRetry();

    return () => { 
      cancelled = true;
      // Cleanup audio on unmount
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [sessionId]);

  // Global mouse event handlers for dragging
  React.useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging !== null) {
        const progressBar = progressBarRefs.current[isDragging];
        if (progressBar && (playingIndex === isDragging || pausedIndex === isDragging)) {
          const rect = progressBar.getBoundingClientRect();
          const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
          const percentage = (x / rect.width) * 100;
          seekAudio(isDragging, Math.max(0, Math.min(100, percentage)));
        }
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDragging !== null) {
        setIsDragging(null);
      }
    };

    if (isDragging !== null) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isDragging, playingIndex, pausedIndex, segmentStartTimes, segmentDurations]);

  const handleAISend = async () => {
    if (!aiPrompt.trim()) return;

    setIsProcessing(true);
    try {
      // Check if MCP server is selected and use intelligent task
      if (selectedMcpServer) {
        const result = await window.electronAPI.ai.sendCommand({
          action: 'run_intelligent_task',
          payload: {
            task: aiPrompt,
            context: {
              sessionId,
              noteContent: notes[selectedNote]?.content || '',
              timestamp: notes[selectedNote]?.timestamp || 0,
              mcpServer: selectedMcpServer,
            },
          },
        });
        
        if (result.result) {
          setAiResponse(typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2));
        } else {
          setAiResponse(result.response || 'Processing complete');
        }
      } else {
        // Fallback to regular AI processing
        const result = await window.electronAPI.ai.sendCommand({
          prompt: aiPrompt,
          context: {
            sessionId,
            noteContent: notes[selectedNote]?.content || '',
            timestamp: notes[selectedNote]?.timestamp || 0,
          },
          type: 'note_enhancement',
        });
        
        setAiResponse(result.response || 'Processing complete');
      }
    } catch (error) {
      console.error('AI processing failed:', error);
      setAiResponse('Processing failed, please try again');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMcpToolExecute = async (toolName: string) => {
    setIsProcessing(true);
    try {
      const result = await window.electronAPI.ai.sendCommand({
        action: 'execute_mcp_tool',
        payload: {
          tool_name: toolName,
          params: {
            context: {
              sessionId,
              noteContent: notes[selectedNote]?.content || '',
              timestamp: notes[selectedNote]?.timestamp || 0,
            },
          },
        },
      });
      
      if (result.result) {
        setAiResponse(`Tool ${toolName} executed:\n${JSON.stringify(result.result, null, 2)}`);
      }
    } catch (error) {
      console.error('MCP tool execution failed:', error);
      setAiResponse('Tool execution failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTimestamp = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Helper function to get end timestamp for a note
  const getEndTimestamp = (index: number): number => {
    if (index < notes.length - 1) {
      return notes[index + 1].timestamp;
    }
    // Last note: use recordingDuration + small padding if available
    if (recordingDuration && recordingDuration >= notes[index].timestamp) {
      return recordingDuration + LAST_NOTE_PADDING_MS;
    }
    return notes[index].timestamp + LAST_NOTE_PADDING_MS;
  };

  const formatSRTTimestamp = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  };

  const convertToSRT = () => {
    if (notes.length === 0) {
      setAiResponse('No notes available to convert to SRT.');
      return;
    }

    let srtContent = '';
    notes.forEach((note, index) => {
      const startTime = formatSRTTimestamp(note.timestamp);
      // For end time, use next note's timestamp or add 5 seconds
      const endTime = notes[index + 1] 
        ? formatSRTTimestamp(notes[index + 1].timestamp - 100)
        : formatSRTTimestamp(
            (recordingDuration && recordingDuration >= note.timestamp)
              ? (recordingDuration + LAST_NOTE_PADDING_MS)
              : (note.timestamp + LAST_NOTE_PADDING_MS)
          );
      
      // Strip markdown formatting and clean the text
      const cleanText = note.content
        .replace(/[#*_~`]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim();
      
      srtContent += `${index + 1}\n${startTime} --> ${endTime}\n${cleanText}\n\n`;
    });

    // Save the SRT file
    const blob = new Blob([srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const datePrefix = new Date().toISOString().replace(/[:.]/g, '_').slice(0, 19);
    a.href = url;
    a.download = `${sessionId}_${datePrefix}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setAiResponse('SRT file has been downloaded successfully.');
  };

  const playAudioSegment = async (index: number) => {
    try {
      if (!audioPath) {
        setAudioError('No audio file found for this recording.');
        return;
      }

      // If clicking play on the same paused segment, resume
      if (pausedIndex === index && audioRef.current && audioRef.current.paused) {
        await audioRef.current.play();
        setPausedIndex(null);
        setPlayingIndex(index);
        startProgressTracking(index);
        return;
      }

      // Stop any existing playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      // Create or update audio element
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      
      audioRef.current.src = audioPath;
      const timestamp = notes[index].timestamp;
      const endTimestamp = getEndTimestamp(index);
      const startTime = timestamp / 1000;
      const endTime = endTimestamp / 1000;
      const duration = endTime - startTime;
      
      // Store segment info for seeking
      setSegmentStartTimes(prev => ({ ...prev, [index]: startTime }));
      setSegmentDurations(prev => ({ ...prev, [index]: duration }));
      
      // Set initial time and play
      audioRef.current.currentTime = startTime;
      setPlayingIndex(index);
      setPausedIndex(null);
      setAudioProgress({ ...audioProgress, [index]: 0 });
      
      await audioRef.current.play();
      
      // Start progress tracking
      startProgressTracking(index);
      
      console.log(`Playing audio from ${startTime}s to ${endTime}s`);
    } catch (error: any) {
      console.error('Failed to play audio:', error);
      setPlayingIndex(null);
      setPausedIndex(null);
      setAudioProgress({});
      if (error.name === 'NotAllowedError') {
        setAudioError('Please interact with the page first to enable audio playback.');
      } else if (error.message?.includes('not found')) {
        setAudioError('No audio file found for this recording.');
      } else {
        setAudioError('Unable to play audio: ' + error.message);
      }
    }
  };

  const startProgressTracking = (index: number) => {
    const startTime = segmentStartTimes[index] || (notes[index].timestamp / 1000);
    const endTime = getEndTimestamp(index) / 1000;
    const duration = segmentDurations[index] || (endTime - startTime);
    
    progressIntervalRef.current = setInterval(() => {
      if (audioRef.current) {
        const currentTime = audioRef.current.currentTime;
        const progress = ((currentTime - startTime) / duration) * 100;
        
        if (currentTime >= endTime || audioRef.current.ended) {
          // Stop when reaching end time
          audioRef.current.pause();
          clearInterval(progressIntervalRef.current!);
          progressIntervalRef.current = null;
          setPlayingIndex(null);
          setPausedIndex(null);
          setAudioProgress((prev) => ({ ...prev, [index]: 0 }));
        } else if (!audioRef.current.paused) {
          setAudioProgress((prev) => ({ ...prev, [index]: Math.min(progress, 100) }));
        }
      }
    }, 100);
  };

  const pauseAudio = () => {
    if (audioRef.current && !audioRef.current.paused && playingIndex !== null) {
      audioRef.current.pause();
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setPausedIndex(playingIndex);
      setPlayingIndex(null);
    }
  };

  const seekAudio = (index: number, progressPercent: number) => {
    if (!audioRef.current || (!playingIndex && !pausedIndex) || (playingIndex !== index && pausedIndex !== index)) {
      return;
    }
    
    const startTime = segmentStartTimes[index] || (notes[index].timestamp / 1000);
    const duration = segmentDurations[index] || (getEndTimestamp(index) / 1000 - startTime);
    const newTime = startTime + (duration * progressPercent / 100);
    
    audioRef.current.currentTime = newTime;
    setAudioProgress(prev => ({ ...prev, [index]: progressPercent }));
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setPlayingIndex(null);
    setPausedIndex(null);
    setAudioProgress({});
  };

  return (
    <div className="h-full flex flex-col">
      {/* Output Path Display */}
      {outputPath && (
        <div className="bg-gray-900 px-4 py-2 mb-2 rounded-lg flex items-center justify-between">
          <span className="text-sm text-gray-400">Output Folder:</span>
          <span className="text-sm text-gray-200 font-mono" title={outputPath}>
            {outputPath}
          </span>
        </div>
      )}
      
      <div className="flex-1 flex space-x-4 overflow-hidden">
        {/* Main Content Area - Expanded Markdown Editor */}
        <div className="flex-1 bg-gray-800 rounded-lg flex flex-col overflow-hidden">
          <h2 className="text-xl font-semibold px-6 pt-6 pb-4">Notes & Media</h2>
          
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {/* Audio Error Display */}
            {audioError && (
              <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 text-red-400 text-sm mb-4">
                {audioError}
              </div>
            )}
            
            {notes.length > 0 ? (
            <div className="space-y-6">
              {notes.map((note, index) => (
                <div
                  key={index}
                  className={`border rounded-lg transition-all ${
                    selectedNote === index
                      ? 'border-blue-500 bg-gray-750'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  {/* Screenshots Section - Horizontal above paragraph */}
                  <div className="bg-gray-900 p-4 rounded-t-lg border-b border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-medium text-gray-300">
                        Screenshots ({formatTimestamp(note.timestamp)} - {formatTimestamp(getEndTimestamp(index))})
                      </div>
                    </div>
                    <div className="overflow-x-auto pb-2">
                      <MultiScreenshotDisplay 
                        sessionId={sessionId} 
                        startTime={note.timestamp}
                        endTime={getEndTimestamp(index)}
                      />
                    </div>
                  </div>
                  
                  {/* Audio Controls Section - Play, Pause, Stop, Progress Bar */}
                  <div className="bg-gray-850 px-4 py-3 border-b border-gray-700">
                    <div className="flex items-center space-x-3">
                      {/* Play/Resume Button */}
                      <button
                        onClick={() => playAudioSegment(index)}
                        disabled={playingIndex === index || !audioPath}
                        className={`p-2 rounded-full transition-colors ${
                          playingIndex === index
                            ? 'bg-green-600 text-white'
                            : pausedIndex === index
                            ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={pausedIndex === index ? 'Resume' : 'Play'}
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                      </button>
                      
                      {/* Pause Button */}
                      <button
                        onClick={pauseAudio}
                        disabled={playingIndex !== index}
                        className={`p-2 rounded-full transition-colors ${
                          playingIndex === index
                            ? 'bg-orange-600 hover:bg-orange-500 text-white'
                            : 'bg-gray-700 text-gray-500'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title="Pause"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M6 4a1 1 0 011 1v10a1 1 0 11-2 0V5a1 1 0 011-1zm8 0a1 1 0 011 1v10a1 1 0 11-2 0V5a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                      
                      {/* Stop Button */}
                      <button
                        onClick={stopAudio}
                        disabled={playingIndex !== index && pausedIndex !== index}
                        className={`p-2 rounded-full transition-colors ${
                          playingIndex === index || pausedIndex === index
                            ? 'bg-red-600 hover:bg-red-500 text-white'
                            : 'bg-gray-700 text-gray-500'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title="Stop"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <rect x="6" y="6" width="8" height="8" rx="1" />
                        </svg>
                      </button>
                      
                      {/* Progress Bar - Interactive with Drag Support */}
                      <div className="flex-1">
                        <div 
                          ref={(el) => { progressBarRefs.current[index] = el; }}
                          className="relative h-3 bg-gray-700 rounded-full overflow-hidden cursor-pointer group"
                          onMouseDown={(e) => {
                            if (playingIndex === index || pausedIndex === index) {
                              e.preventDefault();
                              setIsDragging(index);
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const percentage = (x / rect.width) * 100;
                              seekAudio(index, Math.max(0, Math.min(100, percentage)));
                            }
                          }}
                          onMouseMove={(e) => {
                            if (isDragging === index && (playingIndex === index || pausedIndex === index)) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const percentage = (x / rect.width) * 100;
                              seekAudio(index, Math.max(0, Math.min(100, percentage)));
                            }
                          }}
                          onMouseUp={() => {
                            if (isDragging === index) {
                              setIsDragging(null);
                            }
                          }}
                          onMouseLeave={() => {
                            if (isDragging === index) {
                              setIsDragging(null);
                            }
                          }}
                        >
                          <div
                            className="absolute left-0 top-0 h-full bg-blue-500 pointer-events-none"
                            style={{ 
                              width: `${audioProgress[index] || 0}%`,
                              transition: isDragging === index ? 'none' : 'width 100ms'
                            }}
                          />
                          {/* Hover indicator */}
                          <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 pointer-events-none" />
                          {/* Drag handle - visible on hover or when dragging */}
                          {(playingIndex === index || pausedIndex === index) && (
                            <div 
                              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg pointer-events-none group-hover:opacity-100 transition-opacity"
                              style={{ 
                                left: `calc(${audioProgress[index] || 0}% - 8px)`,
                                opacity: isDragging === index ? 1 : 0
                              }}
                            />
                          )}
                        </div>
                      </div>
                      
                      {/* Time Display */}
                      <div className="text-xs text-gray-400 min-w-[100px] text-right">
                        {formatTimestamp(note.timestamp)} - {formatTimestamp(getEndTimestamp(index))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Monaco Editor for Markdown Content */}
                  <div
                    className="cursor-pointer"
                    onClick={() => setSelectedNote(index)}
                  >
                    <Editor
                      height="200px"
                      defaultLanguage="markdown"
                      value={note.content}
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        lineNumbers: 'off',
                        glyphMargin: false,
                        folding: false,
                        lineDecorationsWidth: 0,
                        lineNumbersMinChars: 0,
                        renderLineHighlight: 'none',
                        scrollbar: {
                          vertical: 'auto',
                          horizontal: 'hidden',
                          verticalScrollbarSize: 10
                        },
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        overviewRulerBorder: false,
                        padding: { top: 16, bottom: 16 }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            ) : (
              <p className="text-gray-400 text-center py-8">No notes available</p>
            )}
          </div>
        </div>

        {/* Right Sidebar - AI Assistant Panel */}
        <div className="flex-shrink-0 w-96 bg-gray-800 rounded-lg flex flex-col overflow-hidden">
          <h2 className="text-lg font-semibold px-4 pt-4 pb-2">AI Assistant</h2>
          
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {/* MCP Server Selection */}
            <div className="mb-4">
            <label className="text-sm text-gray-400 mb-2 block">MCP Server:</label>
            <div className="relative">
              <button
                onClick={() => setShowMcpDropdown(!showMcpDropdown)}
                className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-left flex items-center justify-between"
              >
                <span className="flex items-center">
                  {selectedMcpServer ? (
                    <>
                      <span className="mr-2">
                        {mcpServers.find(s => s.name === selectedMcpServer)?.icon || '🔧'}
                      </span>
                      {selectedMcpServer}
                    </>
                  ) : (
                    'Select MCP Server (Optional)'
                  )}
                </span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d={showMcpDropdown ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                </svg>
              </button>
              
              {showMcpDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-gray-700 rounded shadow-lg max-h-60 overflow-y-auto">
                  <button
                    onClick={() => {
                      setSelectedMcpServer('');
                      setMcpTools([]);
                      setShowMcpDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-gray-600 text-gray-400"
                  >
                    None (Use Default AI)
                  </button>
                  {mcpServers.map((server) => (
                    <button
                      key={server.name}
                      onClick={() => {
                        setSelectedMcpServer(server.name);
                        setShowMcpDropdown(false);
                      }}
                      disabled={!server.enabled}
                      className={`w-full px-3 py-2 text-left flex items-center ${
                        server.enabled ? 'hover:bg-gray-600' : 'opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <span className="mr-2">{server.icon}</span>
                      <div className="flex-1">
                        <div className="font-medium">{server.name}</div>
                        <div className="text-xs text-gray-400">{server.description}</div>
                      </div>
                      {server.active && (
                        <span className="text-xs bg-green-600 px-2 py-1 rounded">Active</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* MCP Tools Display */}
            {selectedMcpServer && mcpTools.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">Available Tools:</p>
                <div className="flex flex-wrap gap-1">
                  {mcpTools.slice(0, 5).map((tool) => (
                    <button
                      key={tool.name}
                      onClick={() => handleMcpToolExecute(tool.name)}
                      disabled={isProcessing}
                      className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
                      title={tool.description || tool.name}
                    >
                      {tool.name}
                    </button>
                  ))}
                  {mcpTools.length > 5 && (
                    <span className="text-xs text-gray-500">+{mcpTools.length - 5} more</span>
                  )}
                </div>
              </div>
            )}
            </div>
            
            <div className="mb-4">
            <p className="text-sm text-gray-400 mb-2">Quick Actions:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAiPrompt('Please summarize the key points of this note')}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Summarize
              </button>
              <button
                onClick={() => setAiPrompt('Please rewrite in more professional language')}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Professionalize
              </button>
              <button
                onClick={() => setAiPrompt('Please list action items')}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Action Items
              </button>
              <button
                onClick={() => setAiPrompt('Please translate to English')}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Translate to English
              </button>
              <button
                onClick={convertToSRT}
                className="px-3 py-2 bg-green-700 hover:bg-green-600 rounded text-sm col-span-2"
              >
                Save as SRT
              </button>
            </div>
            </div>

            <div className="flex flex-col">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Enter command or question..."
                className="bg-gray-900 text-white px-3 py-2 rounded resize-none mb-3 h-24"
                disabled={isProcessing}
              />
              
              <button
                onClick={handleAISend}
                disabled={isProcessing || !aiPrompt.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded mb-3"
              >
                {isProcessing ? 'Processing...' : 'Send'}
              </button>

              {aiResponse && (
                <div className="bg-gray-900 rounded p-3 overflow-y-auto max-h-64">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">AI Response:</h3>
                <Editor
                  height="200px"
                  defaultLanguage="markdown"
                  value={aiResponse}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    lineNumbers: 'off',
                    glyphMargin: false,
                    folding: false,
                    lineDecorationsWidth: 0,
                    lineNumbersMinChars: 0,
                    renderLineHighlight: 'none',
                    scrollbar: {
                      vertical: 'auto',
                      horizontal: 'hidden',
                      verticalScrollbarSize: 10
                    },
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    overviewRulerBorder: false,
                    padding: { top: 8, bottom: 8 }
                  }}
                />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};