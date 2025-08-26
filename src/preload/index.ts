import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
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
    enhanceNote: (data: any) => ipcRenderer.invoke('enhance-note', data),
    processMCP: (data: any) => ipcRenderer.invoke('process-mcp', data),
  },
  
  audio: {
    play: (filePath: string) => ipcRenderer.invoke('play-audio', filePath),
    pause: () => ipcRenderer.invoke('pause-audio'),
    stop: () => ipcRenderer.invoke('stop-audio'),
    getAudioPath: (sessionId: string, timestamp: number) => ipcRenderer.invoke('get-audio-path', sessionId, timestamp),
    getCompleteAudioPath: (sessionId: string, track?: 'mic' | 'sys' | 'mix') => ipcRenderer.invoke('get-complete-audio-path', sessionId, track),
    playWithTimeRange: (filePath: string, startTime: number, endTime: number) => ipcRenderer.invoke('play-audio-with-time-range', filePath, startTime, endTime),
  },
  
  file: {
    selectOutputPath: () => ipcRenderer.invoke('select-output-path'),
    saveMarkdown: (sessionId: string, content: string) => ipcRenderer.invoke('save-markdown', sessionId, content),
    loadRecording: (sessionId: string) => ipcRenderer.invoke('load-recording', sessionId),
    getScreenshotPath: (sessionId: string, timestamp: number, type: 'full' | 'thumb') => ipcRenderer.invoke('get-screenshot-path', sessionId, timestamp, type),
    getScreenshotsInRange: (sessionId: string, startTime: number, endTime: number, type: 'full' | 'thumb') => ipcRenderer.invoke('get-screenshots-in-range', sessionId, startTime, endTime, type),
  },
  
  window: {
    openFloatingWindow: () => ipcRenderer.invoke('open-floating-window'),
    closeFloatingWindow: () => ipcRenderer.invoke('close-floating-window'),
    expandToMainWindow: (sessionId?: string, notes?: string) => ipcRenderer.invoke('expand-to-main-window', sessionId, notes),
    resizeFloatingWindow: (width: number, height: number) => ipcRenderer.invoke('resize-floating-window', width, height),
  },
  
  settings: {
    getRecordingsDir: () => ipcRenderer.invoke('get-recordings-dir'),
  },

  config: {
    getAppConfig: () => ipcRenderer.invoke('get-app-config'),
    getConfigValues: () => ipcRenderer.invoke('get-config-values'),
    saveConfigValues: (values: Record<string, string>) => ipcRenderer.invoke('save-config-values', values),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  },
  
  // Event listeners
  on: (channel: string, callback: Function) => {
    const validChannels = [
      'recording-status',
      'screenshot-captured',
      'ai-response',
      'error',
      'audio-conversion-complete',
      'expanded-from-floating',
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
  platform: NodeJS.Platform;
  recording: {
    start: (screenId: string) => Promise<string>;
    stop: () => Promise<{ duration: number; sessionId: string | null }>;
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
    enhanceNote: (data: any) => Promise<any>;
    processMCP: (data: any) => Promise<any>;
  };
  audio: {
    play: (filePath: string) => Promise<void>;
    pause: () => Promise<void>;
    stop: () => Promise<void>;
    getAudioPath: (sessionId: string, timestamp: number) => Promise<string>;
    getCompleteAudioPath: (sessionId: string, track?: 'mic' | 'sys' | 'mix') => Promise<string>;
    playWithTimeRange: (filePath: string, startTime: number, endTime: number) => Promise<void>;
  };
  file: {
    selectOutputPath: () => Promise<string | null>;
    saveMarkdown: (sessionId: string, content: string) => Promise<void>;
    loadRecording: (sessionId: string) => Promise<any>;
    getScreenshotPath: (sessionId: string, timestamp: number, type: 'full' | 'thumb') => Promise<string>;
    getScreenshotsInRange: (sessionId: string, startTime: number, endTime: number, type: 'full' | 'thumb') => Promise<Array<{path: string; timestamp: number}>>;
  };
  window: {
    openFloatingWindow: () => Promise<boolean>;
    closeFloatingWindow: () => Promise<boolean>;
    expandToMainWindow: (sessionId?: string, notes?: string) => Promise<boolean>;
  };
  settings: {
    getRecordingsDir: () => Promise<string>;
  };
  config: {
    getAppConfig: () => Promise<any>;
    getConfigValues: () => Promise<Record<string, string>>;
    saveConfigValues: (values: Record<string, string>) => Promise<void>;
    selectDirectory: () => Promise<string | null>;
    getAppInfo: () => Promise<{ name: string; version: string; dataPath: string }>;
  };
  on: (channel: string, callback: Function) => void;
  removeListener: (channel: string, callback: Function) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}