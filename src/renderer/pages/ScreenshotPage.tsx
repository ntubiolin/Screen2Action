import React, { useState, useRef, useEffect } from 'react';

export const ScreenshotPage: React.FC = () => {
  const [screenshotId, setScreenshotId] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const captureScreenshot = async () => {
    try {
      const id = await window.electronAPI.screenshot.capture({ fullScreen: true });
      setScreenshotId(id);
      // In a real implementation, we would load the screenshot image
      setScreenshotUrl(`screenshot://${id}`);
      setResponse(null);
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      alert('截圖失敗');
    }
  };

  const executeCommand = async () => {
    if (!screenshotId || !command.trim()) return;

    setIsProcessing(true);
    try {
      const result = await window.electronAPI.ai.sendCommand({
        screenshotId,
        command,
        type: 'screenshot_command',
      });
      
      setResponse(result.message || '指令執行完成');
      
      // Handle specific commands
      if (command.includes('複製')) {
        await window.electronAPI.screenshot.copy(screenshotId);
        setResponse('已複製到剪貼簿');
      } else if (command.includes('存檔')) {
        // In real implementation, would show file dialog
        setResponse('已儲存截圖');
      }
    } catch (error) {
      console.error('Failed to execute command:', error);
      setResponse('指令執行失敗');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    }
  };

  useEffect(() => {
    // Set up global hotkey for screenshot
    const handleHotkey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 's') {
        e.preventDefault();
        captureScreenshot();
      }
    };

    window.addEventListener('keydown', handleHotkey);
    return () => window.removeEventListener('keydown', handleHotkey);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="bg-gray-800 p-4 rounded-lg mb-4">
        <div className="flex items-center justify-between">
          <button
            onClick={captureScreenshot}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>截圖 (⌘+Shift+S)</span>
          </button>
          
          <div className="text-gray-400">
            {screenshotId ? `截圖 ID: ${screenshotId.slice(0, 8)}...` : '尚未截圖'}
          </div>
        </div>
      </div>

      {screenshotId && (
        <div className="flex-1 flex space-x-4">
          <div className="flex-1 bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2">截圖預覽</h2>
            <div className="bg-gray-900 rounded-lg p-4 h-[500px] flex items-center justify-center">
              {screenshotUrl ? (
                <div className="text-gray-500">
                  {/* In real implementation, would display actual screenshot */}
                  <div className="text-center">
                    <svg className="w-32 h-32 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} 
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p>截圖預覽</p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">載入中...</p>
              )}
            </div>
          </div>

          <div className="w-96 bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2">AI 指令</h2>
            
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-2">快速指令：</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCommand('在圖片上標註紅框')}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                >
                  標註紅框
                </button>
                <button
                  onClick={() => setCommand('複製到剪貼簿')}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                >
                  複製
                </button>
                <button
                  onClick={() => setCommand('存檔到桌面')}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                >
                  存檔
                </button>
              </div>
            </div>

            <div className="mb-4">
              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="輸入指令，例如：在右下角按鈕標註紅框..."
                className="w-full h-32 bg-gray-900 text-white px-3 py-2 rounded resize-none"
                disabled={isProcessing}
              />
            </div>

            <button
              onClick={executeCommand}
              disabled={isProcessing || !command.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded flex items-center justify-center"
            >
              {isProcessing ? (
                <span>處理中...</span>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>執行指令</span>
                </>
              )}
            </button>

            {response && (
              <div className="mt-4 p-3 bg-gray-900 rounded">
                <p className="text-sm text-green-400">{response}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};