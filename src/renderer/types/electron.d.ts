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
  on: (channel: string, callback: Function) => void;
  removeListener: (channel: string, callback: Function) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}