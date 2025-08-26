import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Copy, FileImage, Send, X } from 'lucide-react';
import { ImageManipulator, parseLLMAnnotations, type ImageAnnotation } from '../utils/imageManipulation';

interface FloatingAIWindowProps {
  isVisible: boolean;
  onToggle: () => void;
  screenshotPath?: string | null;
  command?: string;
  onInsertScreenshot: (path: string) => void;
  onCopyScreenshot: (path: string) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  screenshot?: string;
  annotations?: ImageAnnotation[];
}


export const FloatingAIWindow: React.FC<FloatingAIWindowProps> = ({
  isVisible,
  onToggle,
  screenshotPath,
  command,
  onInsertScreenshot,
  onCopyScreenshot
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(null);
  const [processedScreenshot, setProcessedScreenshot] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [currentAnnotations, setCurrentAnnotations] = useState<ImageAnnotation[]>([]);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const imageManipulatorRef = useRef<ImageManipulator | null>(null);

  // Initialize chat with screenshot and command when provided
  useEffect(() => {
    if (screenshotPath && command) {
      // Add user message with screenshot and command
      const userMessage: ChatMessage = {
        role: 'user',
        content: command,
        screenshot: screenshotPath
      };
      setChatHistory([userMessage]);
      
      // Process the command with LLM
      processWithLLM(command, screenshotPath);
    }
  }, [screenshotPath, command]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Process screenshot with LLM
  const processWithLLM = async (userCommand: string, imagePath: string) => {
    setIsProcessing(true);
    
    try {
      // Send to LLM for processing
      const result = await window.electronAPI.ai.sendCommand({
        action: 'analyze_screenshot',
        command: userCommand,
        screenshot: imagePath,
        supportGrounding: true
      });

      if (result.success) {
        // Add assistant response
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: result.response,
          annotations: result.annotations
        };
        setChatHistory(prev => [...prev, assistantMessage]);

        // Process annotations if any
        if (result.annotations && result.annotations.length > 0) {
          setCurrentAnnotations(result.annotations);
          await applyAnnotations(imagePath, result.annotations);
        }
      } else {
        // Add error message
        setChatHistory(prev => [...prev, {
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request.'
        }]);
      }
    } catch (error) {
      console.error('Error processing with LLM:', error);
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: 'An error occurred while processing your request.'
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Initialize image manipulator
  useEffect(() => {
    imageManipulatorRef.current = new ImageManipulator();
  }, []);

  // Apply annotations to screenshot
  const applyAnnotations = async (imagePath: string, annotations: ImageAnnotation[]) => {
    if (!imageManipulatorRef.current) return;

    try {
      const processedDataUrl = await imageManipulatorRef.current.applyAnnotations(
        imagePath,
        annotations
      );
      setProcessedScreenshot(processedDataUrl);
    } catch (error) {
      console.error('Error applying annotations:', error);
    }
  };

  // Handle sending new message
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputMessage
    };
    setChatHistory(prev => [...prev, userMessage]);
    setInputMessage('');

    // Continue conversation with context
    await processWithLLM(inputMessage, processedScreenshot || screenshotPath || '');
  };

  // Handle copy screenshot
  const handleCopyScreenshot = () => {
    const pathToCopy = processedScreenshot || screenshotPath;
    if (pathToCopy) {
      onCopyScreenshot(pathToCopy);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  // Handle insert screenshot
  const handleInsertScreenshot = () => {
    const pathToInsert = processedScreenshot || screenshotPath;
    if (pathToInsert) {
      onInsertScreenshot(pathToInsert);
    }
  };

  // Handle screenshot preview
  const handleScreenshotDoubleClick = () => {
    setPreviewScreenshot(processedScreenshot || screenshotPath || null);
  };

  if (!isVisible) return null;

  return (
    <>
      <div 
        className="floating-ai-window"
        style={{
          position: 'absolute',
          bottom: isCollapsed ? '-100%' : '0',
          left: '0',
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(31, 41, 55, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(75, 85, 99, 0.5)',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          transition: 'bottom 0.3s ease-in-out',
          zIndex: 100
        }}
      >
        {/* Header */}
        <div style={{
          height: '40px',
          padding: '8px',
          borderBottom: '1px solid rgba(75, 85, 99, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ color: '#e5e7eb', fontSize: '14px', fontWeight: 500 }}>
            AI Assistant
          </span>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            {isCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Content Area */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: '8px'
        }}>
          {/* Screenshot Display */}
          {screenshotPath && (
            <div style={{
              height: '150px',
              marginBottom: '8px',
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <img
                src={processedScreenshot || `file://${screenshotPath}`}
                alt="Screenshot"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  cursor: 'pointer'
                }}
                onDoubleClick={handleScreenshotDoubleClick}
                title="Double-click to preview"
              />
            </div>
          )}

          {/* Chat Window */}
          <div 
            ref={chatContainerRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              marginBottom: '8px',
              padding: '8px',
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '4px'
            }}
          >
            {chatHistory.map((message, index) => (
              <div
                key={index}
                style={{
                  marginBottom: '12px',
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <div
                  style={{
                    maxWidth: '70%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: message.role === 'user' 
                      ? 'rgba(59, 130, 246, 0.2)'
                      : 'rgba(75, 85, 99, 0.3)',
                    color: '#e5e7eb',
                    fontSize: '13px',
                    lineHeight: '1.5'
                  }}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div style={{
                display: 'flex',
                justifyContent: 'flex-start',
                marginBottom: '12px'
              }}>
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(75, 85, 99, 0.3)',
                  color: '#9ca3af',
                  fontSize: '13px'
                }}>
                  Processing...
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '8px'
          }}>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type your message..."
              disabled={isProcessing}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: 'rgba(55, 65, 81, 0.5)',
                border: '1px solid rgba(75, 85, 99, 0.5)',
                borderRadius: '4px',
                color: '#e5e7eb',
                fontSize: '13px',
                outline: 'none'
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={isProcessing || !inputMessage.trim()}
              style={{
                padding: '8px 12px',
                backgroundColor: isProcessing || !inputMessage.trim() 
                  ? 'rgba(75, 85, 99, 0.3)' 
                  : 'rgba(59, 130, 246, 0.8)',
                border: 'none',
                borderRadius: '4px',
                color: '#e5e7eb',
                cursor: isProcessing || !inputMessage.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Send size={14} />
            </button>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '8px'
          }}>
            <button
              onClick={handleInsertScreenshot}
              disabled={!screenshotPath}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: screenshotPath 
                  ? 'rgba(16, 185, 129, 0.2)' 
                  : 'rgba(75, 85, 99, 0.3)',
                border: '1px solid rgba(16, 185, 129, 0.5)',
                borderRadius: '4px',
                color: screenshotPath ? '#10b981' : '#6b7280',
                cursor: screenshotPath ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '13px'
              }}
            >
              <FileImage size={14} />
              Insert Screenshot
            </button>
            <button
              onClick={handleCopyScreenshot}
              disabled={!screenshotPath}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: screenshotPath 
                  ? 'rgba(59, 130, 246, 0.2)' 
                  : 'rgba(75, 85, 99, 0.3)',
                border: '1px solid rgba(59, 130, 246, 0.5)',
                borderRadius: '4px',
                color: screenshotPath ? '#3b82f6' : '#6b7280',
                cursor: screenshotPath ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '13px'
              }}
            >
              <Copy size={14} />
              {copySuccess ? 'Copied!' : 'Copy Screenshot'}
            </button>
          </div>
        </div>
      </div>

      {/* Collapse/Expand Toggle Button (shown when collapsed) */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            width: '32px',
            height: '32px',
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 101
          }}
          title="Expand AI Assistant"
        >
          <ChevronUp size={16} />
        </button>
      )}

      {/* Screenshot Preview Modal */}
      {previewScreenshot && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            cursor: 'pointer'
          }}
          onClick={() => setPreviewScreenshot(null)}
        >
          <img
            src={previewScreenshot}
            alt="Full preview"
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              objectFit: 'contain'
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setPreviewScreenshot(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '4px',
              color: 'white',
              padding: '8px',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
};