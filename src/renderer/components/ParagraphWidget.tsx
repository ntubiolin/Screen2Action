import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  MessageSquare, 
  Play, 
  Check 
} from 'lucide-react';

interface ParagraphWidgetProps {
  sessionId: string;
  timestamp: number;
  endTimestamp: number;
  onInsertScreenshot: (screenshotPath: string) => void;
  onStartChat: () => void;
  onPlayAudio: () => void;
}

interface Screenshot {
  path: string;
  timestamp: number;
  selected: boolean;
}

export const ParagraphWidget: React.FC<ParagraphWidgetProps> = ({
  sessionId,
  timestamp,
  endTimestamp,
  onInsertScreenshot,
  onStartChat,
  onPlayAudio
}) => {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    loadScreenshots();
  }, [sessionId, timestamp, endTimestamp]);

  const loadScreenshots = async () => {
    setLoading(true);
    try {
      // Validate timestamps
      const maxReasonableDuration = 10 * 60 * 60 * 1000; // 10 hours max
      const actualEndTimestamp = Math.min(endTimestamp, timestamp + maxReasonableDuration);
      
      console.log(`Loading screenshots for widget - timestamp: ${timestamp}, endTimestamp: ${endTimestamp}, actualEndTimestamp: ${actualEndTimestamp}`);
      
      // Limit the number of screenshots to load
      const maxScreenshots = 20;
      const step = Math.max(5000, Math.floor((actualEndTimestamp - timestamp) / maxScreenshots));
      
      // Load all screenshots within the time range
      const screenshotPromises: Promise<Screenshot | null>[] = [];
      let screenshotCount = 0;
      
      for (let ts = timestamp; ts < actualEndTimestamp && screenshotCount < maxScreenshots; ts += step) {
        screenshotCount++;
        screenshotPromises.push(
          window.electronAPI.file.getScreenshotPath(sessionId, ts, 'thumb')
            .then(path => ({ 
              path, 
              timestamp: ts, 
              selected: false 
            }))
            .catch(() => null)
        );
      }

      const results = await Promise.all(screenshotPromises);
      const validScreenshots = results.filter((s): s is Screenshot => s !== null);
      setScreenshots(validScreenshots);
    } catch (error) {
      console.error('Failed to load screenshots:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleScreenshotSelection = (index: number) => {
    setScreenshots(prev => {
      const updated = [...prev];
      updated[index].selected = !updated[index].selected;
      const newSelectedCount = updated.filter(s => s.selected).length;
      setSelectedCount(newSelectedCount);
      return updated;
    });
  };

  const handleInsertSelectedScreenshots = async () => {
    const selected = screenshots.filter(s => s.selected);
    if (selected.length === 0) return;

    // Get full resolution paths for selected screenshots
    for (const screenshot of selected) {
      try {
        const fullPath = await window.electronAPI.file.getScreenshotPath(
          sessionId, 
          screenshot.timestamp, 
          'full'
        );
        onInsertScreenshot(fullPath);
      } catch (error) {
        console.error('Failed to get full screenshot:', error);
      }
    }

    // Clear selections after insert
    setScreenshots(prev => prev.map(s => ({ ...s, selected: false })));
    setSelectedCount(0);
  };

  const formatTimestamp = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="paragraph-widget bg-gray-800 border border-gray-700 rounded-lg p-3 mb-2">
      <div className="flex gap-3">
        {/* Action Buttons on the left */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button
            onClick={handleInsertSelectedScreenshots}
            disabled={selectedCount === 0}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              selectedCount > 0
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Camera size={16} />
            <span>Insert Screenshot{selectedCount > 1 ? 's' : ''} {selectedCount > 0 && `(${selectedCount})`}</span>
          </button>

          <button
            onClick={onStartChat}
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium transition-colors"
          >
            <MessageSquare size={16} />
            <span>LLM Chat</span>
          </button>

          <button
            onClick={onPlayAudio}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors"
          >
            <Play size={16} />
            <span>Play 15s</span>
          </button>
        </div>

        {/* Screenshots Gallery on the right */}
        {screenshots.length > 0 && (
          <div className="screenshots-gallery flex-1">
            <div className="text-xs text-gray-400 mb-1">
              Click to select screenshots:
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {screenshots.map((screenshot, index) => (
                <div 
                  key={index}
                  className="relative flex-shrink-0 cursor-pointer group"
                  onClick={() => toggleScreenshotSelection(index)}
                >
                  <img 
                    src={`file://${screenshot.path}`}
                    alt={`Screenshot at ${formatTimestamp(screenshot.timestamp)}`}
                    className={`w-20 h-14 object-cover rounded border-2 transition-all ${
                      screenshot.selected 
                        ? 'border-blue-500 ring-2 ring-blue-400' 
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  />
                  
                  {/* Selection Indicator */}
                  {screenshot.selected && (
                    <div className="absolute top-1 right-1 bg-blue-500 rounded-full p-0.5">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                  
                  {/* Timestamp Label */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs px-1 py-0.5 text-center">
                    {formatTimestamp(screenshot.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex-1 flex items-center justify-center py-4">
            <div className="text-gray-400 text-sm">Loading screenshots...</div>
          </div>
        )}

        {/* No Screenshots State */}
        {!loading && screenshots.length === 0 && (
          <div className="flex-1 text-gray-500 text-sm italic flex items-center">
            No screenshots available for this section
          </div>
        )}
      </div>
    </div>
  );
};