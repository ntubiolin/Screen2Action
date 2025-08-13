import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useRecordingStore } from '../store/recordingStore';
import { AudioPlayer } from '../components/AudioPlayer';

interface ReviewPageProps {
  sessionId: string;
}

interface ScreenshotDisplayProps {
  sessionId: string;
  timestamp: number;
}

interface MultiScreenshotDisplayProps {
  sessionId: string;
  startTime: number;
  endTime: number;
}

const ScreenshotDisplay: React.FC<ScreenshotDisplayProps> = ({ sessionId, timestamp }) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  React.useEffect(() => {
    const loadScreenshot = async () => {
      try {
        const path = await window.electronAPI.file.getScreenshotPath(sessionId, timestamp, 'thumb');
        setImageSrc(`file://${path}`);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load screenshot:', err);
        setError(true);
        setLoading(false);
      }
    };

    loadScreenshot();
  }, [sessionId, timestamp]);

  if (loading) {
    return (
      <div className="bg-gray-900 rounded h-24 flex items-center justify-center">
        <div className="text-gray-600 text-sm">Loading...</div>
      </div>
    );
  }

  if (error || !imageSrc) {
    return (
      <div className="bg-gray-900 rounded h-24 flex items-center justify-center">
        <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} 
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded h-24 overflow-hidden">
      <img 
        src={imageSrc} 
        alt={`Screenshot at ${timestamp}ms`}
        className="w-full h-full object-cover"
        onError={() => setError(true)}
      />
    </div>
  );
};

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
    <div className="space-y-2">
      <div className="text-xs text-gray-500 mb-1">
        {screenshots.length} screenshot{screenshots.length !== 1 ? 's' : ''} in range
      </div>
      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
        {screenshots.map((screenshot, idx) => (
          <div key={idx} className="bg-gray-900 rounded overflow-hidden h-20">
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
      </div>
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
  
  const { notes } = useRecordingStore();

  // Get output folder path and audio path on mount
  React.useEffect(() => {
    const loadOutputPath = async () => {
      try {
        const metadata = await window.electronAPI.file.loadRecording(sessionId);
        if (metadata?.sessionPath) {
          setOutputPath(metadata.sessionPath);
        } else {
          // Fallback to default path structure
          const defaultPath = `recordings/${sessionId}`;
          setOutputPath(defaultPath);
        }
      } catch (error) {
        console.error('Failed to load output path:', error);
        // Set default path on error
        const defaultPath = `recordings/${sessionId}`;
        setOutputPath(defaultPath);
      }
    };
    
    const loadAudioPath = async () => {
      try {
        const path = await window.electronAPI.audio.getCompleteAudioPath(sessionId, 'mix');
        setAudioPath(`file://${path}`);
        setAudioError('');
      } catch (error: any) {
        console.error('Failed to load audio path:', error);
        setAudioError(error.message || 'Audio file not found');
      }
    };
    
    loadOutputPath();
    loadAudioPath();
  }, [sessionId]);

  const handleAISend = async () => {
    if (!aiPrompt.trim()) return;

    setIsProcessing(true);
    try {
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
    } catch (error) {
      console.error('AI processing failed:', error);
      setAiResponse('Processing failed, please try again');
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
    // For the last note, add 5 seconds
    return notes[index].timestamp + 5000;
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
        : formatSRTTimestamp(note.timestamp + 5000);
      
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

  const playAudioSegment = async (timestamp: number) => {
    try {
      // Get the complete audio file path (mix track)
      const audioPath = await window.electronAPI.audio.getCompleteAudioPath(sessionId, 'mix');
      
      // Find the next note's timestamp for end time, or use current + 5 seconds
      const currentIndex = notes.findIndex(n => n.timestamp === timestamp);
      const endTimestamp = notes[currentIndex + 1]?.timestamp || (timestamp + 5000);
      
      // Play the audio file from start to end timestamp
      await window.electronAPI.audio.playWithTimeRange(audioPath, timestamp / 1000, endTimestamp / 1000);
      
      console.log(`Playing audio from ${timestamp}ms to ${endTimestamp}ms`);
    } catch (error: any) {
      console.error('Failed to play audio:', error);
      // Show user-friendly message based on the error
      if (error.message?.includes('not found')) {
        setAiResponse('No audio file found for this recording. Audio may not have been recorded during this session.');
      } else {
        setAiResponse('Unable to play audio. Please check if audio files exist for this recording.');
      }
    }
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
      
      <div className="flex-1 flex space-x-2 overflow-x-auto">
        {/* Column A: Notes/Markdown */}
        <div className="flex-shrink-0 w-96 bg-gray-800 rounded-lg p-4 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">Notes</h2>
          <div className="prose prose-invert max-w-none">
            {notes.length > 0 ? (
              notes.map((note, index) => (
                <div
                  key={index}
                  className={`mb-4 p-3 rounded cursor-pointer transition-colors ${
                    selectedNote === index ? 'bg-gray-700' : 'hover:bg-gray-750'
                  }`}
                  onClick={() => setSelectedNote(index)}
                >
                  {/* Time range display */}
                  <div className="text-xs text-blue-400 mb-2">
                    {formatTimestamp(note.timestamp)} - {formatTimestamp(getEndTimestamp(index))}
                  </div>
                  <ReactMarkdown>{note.content}</ReactMarkdown>
                </div>
              ))
            ) : (
              <p className="text-gray-400">No notes available</p>
            )}
          </div>
        </div>

        {/* Column B: Screenshots */}
        <div className="flex-shrink-0 w-80 bg-gray-800 rounded-lg p-4 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">Screenshots</h2>
          
          {notes.length > 0 && (
            <div className="space-y-4">
              {notes.map((note, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedNote === index
                      ? 'border-blue-500 bg-gray-700'
                      : 'border-gray-600 hover:bg-gray-750'
                  }`}
                  onClick={() => setSelectedNote(index)}
                >
                  {/* Time display */}
                  <div className="text-xs text-gray-400 mb-2">
                    {formatTimestamp(note.timestamp)} - {formatTimestamp(getEndTimestamp(index))}
                  </div>
                  
                  {/* Multiple screenshots display */}
                  <MultiScreenshotDisplay 
                    sessionId={sessionId} 
                    startTime={note.timestamp}
                    endTime={getEndTimestamp(index)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column C: Audio Playback */}
        <div className="flex-shrink-0 w-80 bg-gray-800 rounded-lg p-4 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">Audio Playback</h2>
          
          {audioError ? (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 text-red-400 text-sm">
              {audioError}
            </div>
          ) : audioPath && notes.length > 0 ? (
            <div className="space-y-3">
              {notes.map((note, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedNote === index
                      ? 'border-blue-500 bg-gray-700'
                      : 'border-gray-600 hover:bg-gray-750'
                  }`}
                  onClick={() => setSelectedNote(index)}
                >
                  <div className="mb-2">
                    <div className="text-xs text-gray-400 mb-1">
                      Segment {index + 1}: {formatTimestamp(note.timestamp)} - {formatTimestamp(getEndTimestamp(index))}
                    </div>
                    <div className="text-sm text-gray-300 line-clamp-2 mb-2">
                      {note.content}
                    </div>
                  </div>
                  <AudioPlayer
                    audioPath={audioPath}
                    startTime={note.timestamp / 1000}
                    endTime={getEndTimestamp(index) / 1000}
                    onError={(err) => console.error('Audio player error:', err)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-sm text-center py-4">
              {notes.length === 0 ? 'No notes available' : 'Loading audio...'}
            </div>
          )}
        </div>

        {/* AI Assistant Panel - Now on the right side */}
        <div className="flex-shrink-0 w-80 bg-gray-800 rounded-lg p-4 flex flex-col">
          <h2 className="text-lg font-semibold mb-4">AI Assistant</h2>
          
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

          <div className="flex-1 flex flex-col">
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Enter command or question..."
              className="flex-1 bg-gray-900 text-white px-3 py-2 rounded resize-none mb-3"
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
              <div className="flex-1 bg-gray-900 rounded p-3 overflow-y-auto">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">AI Response:</h3>
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{aiResponse}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};