import React, { useState, useEffect } from 'react';
import { ReviewPageWithWidgets } from './pages/ReviewPageWithWidgets';

// Development component for testing Review Page directly
function DevApp() {
  // Get session ID from URL parameters or use a default one
  const urlParams = new URLSearchParams(window.location.search);
  const defaultSessionId = 'cc8fb903-f5a0-4c88-877b-d4ef05d408dc'; // Your test session
  const [sessionId, setSessionId] = useState(urlParams.get('sessionId') || defaultSessionId);
  const [inputSessionId, setInputSessionId] = useState(sessionId);

  const isMacOS = window.electronAPI.platform === 'darwin';
  
  return (
    <div className={`h-screen bg-gray-900 text-white flex flex-col ${isMacOS ? 'pt-7' : ''}`}>
      {/* Dev Mode Header */}
      <div className="bg-yellow-600 text-black px-4 py-2 text-sm font-bold">
        ⚠️ DEVELOPMENT MODE - Review Page Testing
      </div>
      
      {/* Session ID Input */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-400">Session ID:</label>
          <input
            type="text"
            value={inputSessionId}
            onChange={(e) => setInputSessionId(e.target.value)}
            className="flex-1 max-w-md bg-gray-700 text-white px-3 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm font-mono"
            placeholder="Enter session ID..."
          />
          <button
            onClick={() => setSessionId(inputSessionId)}
            className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
          >
            Load Session
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
          >
            Refresh
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Current: {sessionId}
        </div>
      </div>

      {/* Review Page */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <ReviewPageWithWidgets sessionId={sessionId} />
      </main>
    </div>
  );
}

export default DevApp;