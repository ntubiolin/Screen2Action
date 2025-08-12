import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  recording: {
    start: (screenId: string) => ipcRenderer.invoke('start-recording', screenId),
    stop: () => ipcRenderer.invoke('stop-recording'),
    getStatus: () => ipcRenderer.invoke('get-recording-status'),
  },
  
  screenshot: {
    capture: (options?: any) => ipcRenderer.invoke('capture-screenshot', options),
    copy: (id: string) => ipcRenderer.invoke('copy-screenshot', id),
    save: (id: string, path: string) => ipcRenderer.invoke('save-screenshot', id, path),
  },
  
  sources: {
    getDesktopSources: () => ipcRenderer.invoke('get-sources'),
  },
  
  ai: {
    sendCommand: (data: any) => ipcRenderer.invoke('send-to-ai', data),
  },
  
  audio: {
    play: (filePath: string) => ipcRenderer.invoke('play-audio', filePath),
    pause: () => ipcRenderer.invoke('pause-audio'),
    stop: () => ipcRenderer.invoke('stop-audio'),
    getAudioPath: (sessionId: string, timestamp: number) => ipcRenderer.invoke('get-audio-path', sessionId, timestamp),
  },
  
  file: {
    selectOutputPath: () => ipcRenderer.invoke('select-output-path'),
    saveMarkdown: (sessionId: string, content: string) => ipcRenderer.invoke('save-markdown', sessionId, content),
    loadRecording: (sessionId: string) => ipcRenderer.invoke('load-recording', sessionId),
    getScreenshotPath: (sessionId: string, timestamp: number, type: 'full' | 'thumb') => ipcRenderer.invoke('get-screenshot-path', sessionId, timestamp, type),
  },
  
  // Event listeners
  on: (channel: string, callback: Function) => {
    const validChannels = [
      'recording-status',
      'screenshot-captured',
      'ai-response',
      'error',
      'audio-conversion-complete',
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  
  removeListener: (channel: string, callback: Function) => {
    ipcRenderer.removeListener(channel, callback as any);
  },
});

// Type definitions for TypeScript
export interface ElectronAPI {
  recording: {
    start: (screenId: string) => Promise<string>;
    stop: () => Promise<void>;
    getStatus: () => Promise<any>;
  };
  screenshot: {
    capture: (options?: any) => Promise<string>;
    copy: (id: string) => Promise<void>;
    save: (id: string, path: string) => Promise<void>;
  };
  sources: {
    getDesktopSources: () => Promise<any[]>;
  };
  ai: {
    sendCommand: (data: any) => Promise<any>;
  };
  audio: {
    play: (filePath: string) => Promise<void>;
    pause: () => Promise<void>;
    stop: () => Promise<void>;
    getAudioPath: (sessionId: string, timestamp: number) => Promise<string>;
  };
  file: {
    selectOutputPath: () => Promise<string | null>;
    saveMarkdown: (sessionId: string, content: string) => Promise<void>;
    loadRecording: (sessionId: string) => Promise<any>;
    getScreenshotPath: (sessionId: string, timestamp: number, type: 'full' | 'thumb') => Promise<string>;
  };
  on: (channel: string, callback: Function) => void;
  removeListener: (channel: string, callback: Function) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}