import React, { useState, useEffect } from 'react';
import { RecordingPage } from './pages/RecordingPage';
import { ScreenshotPage } from './pages/ScreenshotPage';
import { ReviewPage } from './pages/ReviewPage';
import { ReviewPageEnhanced } from './pages/ReviewPageEnhanced';
import { FloatingWindow } from './components/FloatingWindow';

type Page = 'recording' | 'screenshot' | 'review';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('recording');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isFloatingMode, setIsFloatingMode] = useState(false);

  useEffect(() => {
    // Check if we're in floating mode based on URL hash
    if (window.location.hash === '#/floating') {
      setIsFloatingMode(true);
    } else {
      // Check for expanded session data from floating window
      const expandedSessionId = localStorage.getItem('expandedSessionId');
      const expandedNotes = localStorage.getItem('expandedNotes');
      
      if (expandedSessionId) {
        setSessionId(expandedSessionId);
        setCurrentPage('review');
        
        // Clean up localStorage
        localStorage.removeItem('expandedSessionId');
        localStorage.removeItem('expandedNotes');
      }
    }
  }, []);

  const handleRecordingComplete = (id: string) => {
    setSessionId(id);
    setCurrentPage('review');
  };

  const handleExpand = async (passedSessionId?: string, passedNotes?: string) => {
    // Store session data in localStorage for the main window to retrieve
    if (passedSessionId) {
      localStorage.setItem('expandedSessionId', passedSessionId);
    }
    if (passedNotes) {
      localStorage.setItem('expandedNotes', passedNotes);
    }
    
    await window.electronAPI.window.expandToMainWindow();
  };

  const handleClose = async () => {
    await window.electronAPI.window.closeFloatingWindow();
  };

  // Render floating window if in floating mode
  if (isFloatingMode) {
    return (
      <div style={{ 
        width: '100vw', 
        height: '100vh', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: 'transparent'
      }}>
        <FloatingWindow onExpand={handleExpand} onClose={handleClose} />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      <nav className="bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="px-4 py-3">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold">Screen2Action</h1>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage('recording')}
                className={`px-4 py-2 rounded ${
                  currentPage === 'recording'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Meeting Recording
              </button>
              <button
                onClick={() => setCurrentPage('screenshot')}
                className={`px-4 py-2 rounded ${
                  currentPage === 'screenshot'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Smart Screenshot
              </button>
              {sessionId && (
                <button
                  onClick={() => setCurrentPage('review')}
                  className={`px-4 py-2 rounded ${
                    currentPage === 'review'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Review
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 container mx-auto p-4 flex flex-col overflow-hidden">
        {currentPage === 'recording' && (
          <RecordingPage onRecordingComplete={handleRecordingComplete} />
        )}
        {currentPage === 'screenshot' && <ScreenshotPage />}
        {currentPage === 'review' && sessionId && (
          <ReviewPageEnhanced sessionId={sessionId} />
        )}
      </main>
    </div>
  );
}

export default App;