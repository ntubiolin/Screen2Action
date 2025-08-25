import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface AudioPlayerProps {
  audioPath: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  onError?: (error: string) => void;
}

// Custom hook for audio player logic
export const useAudioPlayer = (
  audioPath: string,
  startTime: number,
  endTime: number,
  onError?: (error: string) => void
) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [isLoading, setIsLoading] = useState(true);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const duration = useMemo(() => endTime - startTime, [endTime, startTime]);

  const stopProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const handleStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = startTime;
      setCurrentTime(startTime);
      setIsPlaying(false);
      stopProgressTracking();
    }
  }, [startTime, stopProgressTracking]);

  const startProgressTracking = useCallback(() => {
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
  }, [endTime, handleStop]);

  const handlePlay = useCallback(async () => {
    if (!audioRef.current) return;
    
    try {
      audioRef.current.currentTime = startTime;
      await audioRef.current.play();
      setIsPlaying(true);
      startProgressTracking();
    } catch (err) {
      console.error('Failed to play audio:', err);
      onError?.('Failed to play audio');
    }
  }, [startTime, startProgressTracking, onError]);

  const handlePause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      stopProgressTracking();
    }
  }, [stopProgressTracking]);

  const handleSeek = useCallback((newTime: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    setIsLoading(false);
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
    }
  }, [startTime]);

  const handleAudioError = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    console.error('Audio error:', e);
    setIsLoading(false);
    onError?.('Failed to load audio file');
  }, [onError]);

  // Reset when props change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
      setCurrentTime(startTime);
    }
  }, [audioPath, startTime, endTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopProgressTracking();
    };
  }, [stopProgressTracking]);

  const getProgress = useCallback((): number => {
    if (duration === 0) return 0;
    return ((currentTime - startTime) / duration) * 100;
  }, [currentTime, startTime, duration]);

  return {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    isLoading,
    handlePlay,
    handlePause,
    handleStop,
    handleSeek,
    handleLoadedMetadata,
    handleAudioError,
    getProgress,
  };
};

// Utility functions
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Icon components for better organization
const PlayIcon: React.FC = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M5 4.5v11l10-5.5-10-5.5z" />
  </svg>
);

const PauseIcon: React.FC = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M6 4.5v11a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5h1a.5.5 0 01.5.5zm8 0v11a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5h1a.5.5 0 01.5.5z" />
  </svg>
);

const StopIcon: React.FC = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
    <rect x="6" y="6" width="8" height="8" />
  </svg>
);

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ 
  audioPath, 
  startTime, 
  endTime,
  onError 
}) => {
  const {
    audioRef,
    isPlaying,
    currentTime,
    isLoading,
    handlePlay,
    handlePause,
    handleStop,
    handleSeek,
    handleLoadedMetadata,
    handleAudioError,
    getProgress,
  } = useAudioPlayer(audioPath, startTime, endTime, onError);

  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleSeek(parseFloat(e.target.value));
  }, [handleSeek]);

  return (
    <div className="bg-gray-900 rounded-lg p-3" data-testid="audio-player">
      <audio
        ref={audioRef}
        src={audioPath}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleAudioError}
        data-testid="audio-element"
      />
      
      {isLoading ? (
        <div className="text-gray-500 text-sm text-center py-2" data-testid="loading-state">
          Loading audio...
        </div>
      ) : (
        <>
          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span data-testid="current-time">{formatTime(currentTime)}</span>
              <span data-testid="end-time">{formatTime(endTime)}</span>
            </div>
            <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="absolute h-full bg-blue-500 transition-all duration-100"
                style={{ width: `${getProgress()}%` }}
                data-testid="progress-bar"
              />
              <input
                type="range"
                min={startTime}
                max={endTime}
                step={0.1}
                value={currentTime}
                onChange={handleSeekChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                data-testid="seek-slider"
                aria-label="Seek audio"
              />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center space-x-2">
            <button
              onClick={handleStop}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full transition-colors"
              title="Stop"
              data-testid="stop-button"
              aria-label="Stop audio"
            >
              <StopIcon />
            </button>
            
            {isPlaying ? (
              <button
                onClick={handlePause}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
                title="Pause"
                data-testid="pause-button"
                aria-label="Pause audio"
              >
                <PauseIcon />
              </button>
            ) : (
              <button
                onClick={handlePlay}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
                title="Play"
                data-testid="play-button"
                aria-label="Play audio"
              >
                <PlayIcon />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};