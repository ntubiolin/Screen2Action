import React, { useState } from 'react';
import { RecordingPage } from './pages/RecordingPage';
import { ScreenshotPage } from './pages/ScreenshotPage';
import { ReviewPage } from './pages/ReviewPage';

type Page = 'recording' | 'screenshot' | 'review';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('recording');
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleRecordingComplete = (id: string) => {
    setSessionId(id);
    setCurrentPage('review');
  };

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
          <ReviewPage sessionId={sessionId} />
        )}
      </main>
    </div>
  );
}

export default App;