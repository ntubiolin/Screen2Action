import React, { useState, useRef, useEffect } from 'react';

interface AudioPlayerProps {
  audioPath: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  onError?: (error: string) => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ 
  audioPath, 
  startTime, 
  endTime,
  onError 
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [duration, setDuration] = useState(endTime - startTime);
  const [isLoading, setIsLoading] = useState(true);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
      setDuration(endTime - startTime);
      setCurrentTime(startTime);
    }
  }, [audioPath, startTime, endTime]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const handleLoadedMetadata = () => {
    setIsLoading(false);
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
    }
  };

  const handlePlay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
          startProgressTracking();
        })
        .catch(err => {
          console.error('Failed to play audio:', err);
          onError?.('Failed to play audio');
        });
    }
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      stopProgressTracking();
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = startTime;
      setCurrentTime(startTime);
      setIsPlaying(false);
      stopProgressTracking();
    }
  };

  const startProgressTracking = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    progressIntervalRef.current = setInterval(() => {
      if (audioRef.current) {
        const current = audioRef.current.currentTime;
        
        // Check if we've reached the end time
        if (current >= endTime) {
          handleStop();
        } else {
          setCurrentTime(current);
        }
      }
    }, 100);
  };

  const stopProgressTracking = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgress = (): number => {
    if (duration === 0) return 0;
    return ((currentTime - startTime) / duration) * 100;
  };

  return (
    <div className="bg-gray-900 rounded-lg p-3">
      <audio
        ref={audioRef}
        src={audioPath}
        onLoadedMetadata={handleLoadedMetadata}
        onError={(e) => {
          console.error('Audio error:', e);
          setIsLoading(false);
          onError?.('Failed to load audio file');
        }}
      />
      
      {isLoading ? (
        <div className="text-gray-500 text-sm text-center py-2">
          Loading audio...
        </div>
      ) : (
        <>
          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(endTime)}</span>
            </div>
            <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="absolute h-full bg-blue-500 transition-all duration-100"
                style={{ width: `${getProgress()}%` }}
              />
              <input
                type="range"
                min={startTime}
                max={endTime}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center space-x-2">
            <button
              onClick={handleStop}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full transition-colors"
              title="Stop"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <rect x="6" y="6" width="8" height="8" />
              </svg>
            </button>
            
            {isPlaying ? (
              <button
                onClick={handlePause}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
                title="Pause"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 4.5v11a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5h1a.5.5 0 01.5.5zm8 0v11a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5h1a.5.5 0 01.5.5z" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handlePlay}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
                title="Play"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 4.5v11l10-5.5-10-5.5z" />
                </svg>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};