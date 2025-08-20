import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, Menu } from 'electron';
import path from 'path';
import { WebSocketServer } from './websocket';
import { RecordingManager } from './recording';
import { ScreenshotManager } from './screenshot';
import { getRecordingsDir } from './config';
import { BackendManager } from './backend-manager';
import { ConfigManager } from './config-manager';

// Enable live reload for Electron in development
if (process.env.NODE_ENV !== 'production') {
  // Path from dist/main to project root's node_modules
  const electronPath = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'electron');
  require('electron-reload')(path.join(__dirname, '..'), {
    electron: electronPath,
    hardResetMethod: 'exit'
  });
}

// Handle cleanup on process exit/restart
process.on('SIGINT', async () => {
  console.log('Received SIGINT, cleaning up...');
  if (wsServer) {
    await wsServer.stop();
    wsServer = null;
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, cleaning up...');
  if (wsServer) {
    await wsServer.stop();
    wsServer = null;
  }
  process.exit(0);
});

let mainWindow: BrowserWindow | null = null;
let floatingWindow: BrowserWindow | null = null;
let wsServer: WebSocketServer | null = null;
let recordingManager: RecordingManager | null = null;
let screenshotManager: ScreenshotManager | null = null;
let backendManager: BackendManager | null = null;
let configManager: ConfigManager | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createFloatingWindow() {
  floatingWindow = new BrowserWindow({
    width: 400,
    height: 300,
    minWidth: 300,
    minHeight: 200,
    alwaysOnTop: true,
    frame: false,
    transparent: false,  // Changed to false for better compatibility
    resizable: true,
    hasShadow: true,
    backgroundColor: '#1f2937',  // Dark background color
    titleBarStyle: 'hidden',  // Hide title bar but keep window controls on macOS
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Exclude floating window content from OS-level screen capture/recording
  // This avoids the need to hide/show the window during periodic screenshots
  floatingWindow.setContentProtection(true);

  if (process.env.NODE_ENV === 'development') {
    floatingWindow.loadURL('http://localhost:3000#/floating');
  } else {
    floatingWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: '/floating'
    });
  }

  floatingWindow.on('closed', () => {
    floatingWindow = null;
  });
}

app.whenReady().then(async () => {
  // Create application menu
  const template: any[] = [
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          role: 'undo'
        },
        {
          label: 'Redo',
          accelerator: process.platform === 'darwin' ? 'Shift+Cmd+Z' : 'Ctrl+Y',
          role: 'redo'
        },
        { type: 'separator' },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          role: 'cut'
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          role: 'copy'
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          role: 'paste'
        },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          role: 'selectAll'
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Floating Window',
          click: () => {
            if (!floatingWindow) {
              createFloatingWindow();
            } else {
              floatingWindow.focus();
            }
          }
        },
        {
          label: 'Main Window',
          click: () => {
            if (!mainWindow) {
              createWindow();
            } else {
              mainWindow.focus();
            }
          }
        },
        {
          label: 'Settings',
          click: () => {
            // Create settings window
            const settingsWindow = new BrowserWindow({
              width: 800,
              height: 600,
              titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
              webPreferences: {
                preload: path.join(__dirname, '../preload/index.js'),
                contextIsolation: true,
                enableRemoteModule: false,
                nodeIntegration: false,
              },
            });

            const isDev = process.env.NODE_ENV === 'development';
            if (isDev) {
              settingsWindow.loadURL(`http://localhost:3000?page=settings`);
            } else {
              settingsWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
                hash: 'settings'
              });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: (item: any, focusedWindow: BrowserWindow | undefined) => {
            if (focusedWindow) focusedWindow.reload();
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: (item: any, focusedWindow: BrowserWindow | undefined) => {
            if (focusedWindow) focusedWindow.webContents.toggleDevTools();
          }
        }
      ]
    }
  ];

  // Add macOS app menu
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Start with floating window as default
  createFloatingWindow();
  
  // Initialize managers
  wsServer = new WebSocketServer();
  recordingManager = new RecordingManager();
  screenshotManager = new ScreenshotManager();
  backendManager = new BackendManager();
  configManager = new ConfigManager();
  
  // Start WebSocket server for Python backend communication
  try {
    const wsStarted = await wsServer.start(8765);
    if (!wsStarted) {
      console.error('WebSocket server failed to start on port 8765');
      // Show a user-friendly error message
      dialog.showErrorBox(
        'WebSocket Server Error',
        'Failed to start WebSocket server on port 8765. The application may not function properly.'
      );
    } else {
      console.log('WebSocket server started successfully on port 8765');
    }
  } catch (error) {
    console.error('Error starting WebSocket server:', error);
    dialog.showErrorBox(
      'WebSocket Server Error',
      `Failed to start WebSocket server: ${error}`
    );
  }

  // Start Python backend in production
  if (backendManager && (process.env.NODE_ENV === 'production' || !process.env.NODE_ENV)) {
    try {
      console.log('Starting Python backend...');
      const backendStarted = await backendManager.startBackend();
      if (!backendStarted) {
        console.error('Failed to start Python backend');
        await backendManager.showBackendErrorDialog();
      } else {
        console.log('Python backend started successfully');
      }
    } catch (error) {
      console.error('Error starting Python backend:', error);
      await backendManager.showBackendErrorDialog();
    }
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Create floating window on activate as well
      createFloatingWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  // Clean up WebSocket server
  if (wsServer) {
    await wsServer.stop();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up on app quit
app.on('before-quit', async (event) => {
  if (wsServer || backendManager) {
    event.preventDefault();
    
    if (wsServer) {
      await wsServer.stop();
      wsServer = null;
    }
    
    if (backendManager) {
      await backendManager.stopBackend();
      backendManager = null;
    }
    
    app.quit();
  }
});

// Utility: convert all webm audio chunks for a session to mp3
async function convertAudioChunksToMp3(sessionId: string) { /* removed: backend handles audio */ return { converted: 0, total: 0 }; }

// IPC Handlers for floating window
ipcMain.handle('open-floating-window', async () => {
  if (!floatingWindow) {
    createFloatingWindow();
  }
  return true;
});

ipcMain.handle('close-floating-window', async () => {
  if (floatingWindow) {
    floatingWindow.close();
  }
  return true;
});

ipcMain.handle('expand-to-main-window', async (event, sessionId?: string, notes?: string) => {
  if (floatingWindow) {
    floatingWindow.close();
  }
  if (!mainWindow) {
    createWindow();
    // Wait for window to be ready
    mainWindow!.webContents.once('did-finish-load', () => {
      // Send only the sessionId to the main window (notes are already saved to disk)
      if (sessionId) {
        mainWindow!.webContents.send('expanded-from-floating', { sessionId });
      }
    });
  } else {
    mainWindow.focus();
    // Send only the sessionId to the existing main window (notes are already saved to disk)
    if (sessionId) {
      mainWindow.webContents.send('expanded-from-floating', { sessionId });
    }
  }
  return true;
});

// IPC Handlers
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
  });
  return sources;
});

ipcMain.handle('start-recording', async (_, screenId: string) => {
  if (recordingManager) {
    const sessionId = await recordingManager.startRecording(screenId);
    
    // Also start audio recording in Python backend
    if (wsServer) {
      try {
        await wsServer.sendMessage({
          type: 'command',
          action: 'start_recording',
          payload: {
            sessionId,
            screenId
          }
        });
        console.log('Started audio recording in backend for session:', sessionId);
      } catch (error: any) {
        console.warn('Python backend not connected for audio recording:', error.message);
        // Continue without audio if backend is not connected
        // The recording will still work, just without audio
      }
    }
    
    return sessionId;
  }
  throw new Error('Recording manager not initialized');
});

ipcMain.handle('stop-recording', async () => {
  if (recordingManager) {
    const sessionId = recordingManager.getCurrentSessionId();
    // Stop audio recording in Python backend
    if (wsServer) {
      try {
        await wsServer.sendMessage({
          type: 'command',
          action: 'stop_recording',
          payload: {}
        });
        console.log('Stopped audio recording in backend');
      } catch (error: any) {
        console.warn('Python backend not connected for stopping audio:', error.message);
      }
    }
    const result = await recordingManager.stopRecording();
    return result; // { duration, sessionId }
  }
  throw new Error('Recording manager not initialized');
});

ipcMain.handle('capture-screenshot', async (_, options: any) => {
  if (screenshotManager) {
    return await screenshotManager.capture(options);
  }
  throw new Error('Screenshot manager not initialized');
});

ipcMain.handle('send-to-ai', async (_, data: any) => {
  console.log('Received AI command:', data);
  if (wsServer) {
    // If data has an action field, use it directly, otherwise default to process_command
    const message = data.action ? {
      type: 'request',
      action: data.action,
      payload: data.payload || {},
    } : {
      type: 'request', 
      action: 'process_command',
      payload: data,
    };
    console.log('Sending to backend:', message);
    const result = await wsServer.sendMessage(message);
    console.log('Backend response:', result);
    return result;
  }
  throw new Error('WebSocket server not initialized');
});

ipcMain.handle('enhance-note', async (_, data: any) => {
  if (wsServer) {
    return await wsServer.sendMessage({
      type: 'request',
      action: 'enhance_note',
      payload: data,
    });
  }
  throw new Error('WebSocket server not initialized');
});

ipcMain.handle('process-mcp', async (_, data: any) => {
  if (wsServer) {
    return await wsServer.sendMessage({
      type: 'request',
      action: 'process_mcp',
      payload: data,
    });
  }
  throw new Error('WebSocket server not initialized');
});

// Audio handlers
ipcMain.handle('play-audio', async (_, filePath: string) => {
  const fs = require('fs').promises;
  const { shell } = require('electron');
  
  try {
    // Check if the audio file exists
    await fs.access(filePath);
    
    // Use shell.openPath to play the audio file with the default system player
    const result = await shell.openPath(filePath);
    
    if (result) {
      console.error('Failed to play audio:', result);
      throw new Error(`Failed to play audio: ${result}`);
    }
    
    console.log('Playing audio:', filePath);
    return;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error('Audio file not found:', filePath);
      throw new Error('Audio file not found. Audio recording may not have been enabled during the recording session.');
    }
    throw error;
  }
});

ipcMain.handle('pause-audio', async () => {
  console.log('Pausing audio');
  return;
});

ipcMain.handle('stop-audio', async () => {
  console.log('Stopping audio');
  return;
});

ipcMain.handle('get-complete-audio-path', async (_, sessionId: string, track: 'mic' | 'sys' | 'mix' = 'mix') => {
  const fs = require('fs');
  // Use unified recordings directory
  const unifiedRecordingsDir = getRecordingsDir();
  const audioDir = path.join(unifiedRecordingsDir, sessionId, 'audio');
  
  // Check if directory exists
  if (!fs.existsSync(audioDir)) {
    // Create directory for new recordings
    fs.mkdirSync(audioDir, { recursive: true });
    return ''; // Return empty string if no audio files exist yet
  }
  
  try {
    const files = fs.readdirSync(audioDir);
    
    // If no files, return empty string
    if (files.length === 0) {
      return '';
    }
    
    // Look for complete audio file with pattern: YYYY_MM_DD_HH_mm_SS_full_<track>.wav
    const completeFile = files.find((f: string) => f.includes('_full_') && f.includes(`_${track}.wav`));
    
    if (completeFile) {
      const fullPath = path.join(audioDir, completeFile);
      console.log(`Found audio file: ${track} track for session ${sessionId}`);
      return fullPath;
    }
    
    // Fallback to any audio file for the track
    const trackFile = files.find((f: string) => f.includes(`_${track}.`) && (f.endsWith('.wav') || f.endsWith('.mp3') || f.endsWith('.webm')));
    if (trackFile) {
      return path.join(audioDir, trackFile);
    }
    
    return ''; // Return empty string instead of throwing error
  } catch (error) {
    console.error(`Error finding audio file: ${error}`);
    return ''; // Return empty string instead of throwing error
  }
});

ipcMain.handle('play-audio-with-time-range', async (_, filePath: string, startTime: number, endTime: number) => {
  const { shell } = require('electron');
  const fs = require('fs');
  
  try {
    // Check if the audio file exists
    if (fs.existsSync(filePath)) {
      // For now, we'll use the default system player
      // In future, we could use ffplay with time range parameters
      const result = await shell.openPath(filePath);
      
      if (result) {
        console.error('Failed to play audio with time range:', result);
        throw new Error(`Failed to play audio: ${result}`);
      }
      
      console.log(`Playing audio from ${startTime}s to ${endTime}s: ${filePath}`);
      // Note: System player won't respect time range, but at least plays the file
      // TODO: Implement proper time-range playback using ffplay or web audio
      return;
    } else {
      console.error('Audio file not found:', filePath);
      throw new Error('Audio file not found');
    }
  } catch (error) {
    console.error('Error playing audio with time range:', error);
    throw error;
  }
});

ipcMain.handle('get-audio-path', async (_, sessionId: string, timestamp: number) => {
  const fs = require('fs');
  // Use unified recordings directory
  const unifiedRecordingsDir = getRecordingsDir();
  const audioDir = path.join(unifiedRecordingsDir, sessionId, 'audio');
  
  // Check if directory exists
  if (!fs.existsSync(audioDir)) {
    console.error(`Audio directory not found for session ${sessionId} at ${audioDir}`);
    throw new Error('Audio directory not found');
  }
  
  try {
    // First try exact match with new pattern
    const files = fs.readdirSync(audioDir);
    const targetSuffix = `_${timestamp}.webm`;
    const exactMatch = files.find((f: string) => f.endsWith(targetSuffix));
    
    if (exactMatch) {
      return path.join(audioDir, exactMatch);
    }
    
    // Try legacy pattern
    const legacyFile = `${timestamp}.webm`;
    if (files.includes(legacyFile)) {
      return path.join(audioDir, legacyFile);
    }
    
    // Find closest audio file (support .webm, .wav, and .mp3)
    const audioFiles = files
      .filter((f: string) => f.endsWith('.webm') || f.endsWith('.wav') || f.endsWith('.mp3'))
      .map((f: string) => {
        // Try to extract timestamp from filename
        // Pattern for webm/mp3: YYYY_MM_DD_HH_mm_SS_<timestamp>.webm/.mp3
        const webmMp3Match = f.match(/_(\d+)\.(webm|mp3)$/);
        if (webmMp3Match) {
          return { file: f, timestamp: parseInt(webmMp3Match[1]) };
        }
        
        // Pattern for WAV from backend: YYYY_MM_DD_HH_mm_SS_<chunkIdx>_<relMs>_<track>.wav
        const wavMatch = f.match(/_\d+_(\d+)_\w+\.wav$/);
        if (wavMatch) {
          return { file: f, timestamp: parseInt(wavMatch[1]) };
        }
        
        // Try legacy pattern: <timestamp>.webm
        const legacyMatch = f.match(/^(\d+)\.webm$/);
        if (legacyMatch) {
          return { file: f, timestamp: parseInt(legacyMatch[1]) };
        }
        return null;
      })
      .filter(Boolean) as { file: string; timestamp: number }[];
    
    if (audioFiles.length === 0) {
      console.error(`No audio files found in ${audioDir}`);
      throw new Error('No audio files found in recording');
    }
    
    // Find the closest timestamp
    let closest = audioFiles[0];
    let minDiff = Math.abs(closest.timestamp - timestamp);
    
    for (const audioFile of audioFiles) {
      const diff = Math.abs(audioFile.timestamp - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = audioFile;
      }
    }
    
    // Only log if significant time difference
    if (minDiff > 1000) {
      console.log(`Using closest audio file: ${closest.file} for timestamp ${timestamp} (diff: ${minDiff}ms)`);
    }
    return path.join(audioDir, closest.file);
    
  } catch (error) {
    console.error(`Error finding audio file: ${error}`);
    throw new Error('Audio file not found');
  }
});

// File handlers
ipcMain.handle('select-output-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Output Directory',
  });
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePaths[0];
});

ipcMain.handle('save-markdown', async (_, sessionId: string, content: string) => {
  const fs = require('fs').promises;
  const pathMod = require('path');
  const unifiedRecordingsDir = getRecordingsDir();
  const sessionDir = pathMod.join(unifiedRecordingsDir, sessionId);
  
  // Ensure the directory exists
  await fs.mkdir(sessionDir, { recursive: true });
  
  // Helper to build datetime prefix
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const prefix = `${now.getFullYear()}_${pad(now.getMonth()+1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`;
  const prefixedName = `${prefix}_notes.md`;
  const markdownPathPrefixed = pathMod.join(sessionDir, prefixedName);
  // Backwards compatibility original filename
  const markdownPathLegacy = pathMod.join(sessionDir, 'notes.md');
  await fs.writeFile(markdownPathPrefixed, content, 'utf-8');
  // Also write legacy file so any existing tooling still works
  try { await fs.writeFile(markdownPathLegacy, content, 'utf-8'); } catch {}
});

ipcMain.handle('load-recording', async (_, sessionId: string) => {
  const fs = require('fs').promises;
  // Use unified recordings directory
  const recordingsDir = getRecordingsDir();
  const sessionDir = path.join(recordingsDir, sessionId);
  const metadataPath = path.join(sessionDir, 'metadata.json');
  
  try {
    // Check if recordings directory exists
    await fs.access(recordingsDir);
  } catch {
    // Create recordings directory if it doesn't exist
    await fs.mkdir(recordingsDir, { recursive: true });
    // Return empty metadata for new session
    console.log(`Creating new session directory for ${sessionId}`);
    await fs.mkdir(sessionDir, { recursive: true });
    const defaultMetadata = {
      sessionId,
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      notes: ''
    };
    await fs.writeFile(metadataPath, JSON.stringify(defaultMetadata, null, 2));
    return defaultMetadata;
  }
  
  try {
    // Check if session directory exists
    await fs.access(sessionDir);
    
    // Check if metadata file exists
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);
    
    // Normalize metadata format (handle both Python backend and JS frontend formats)
    const normalizedMetadata: any = {
      sessionId: metadata.id || metadata.sessionId || sessionId,
      startTime: metadata.start_time ? new Date(metadata.start_time).getTime() : metadata.startTime,
      endTime: metadata.end_time ? new Date(metadata.end_time).getTime() : metadata.endTime,
      duration: metadata.duration || 0,
      notes: metadata.notes || ''
    };
    
    // Try to load notes from markdown file if not in metadata
    if (!normalizedMetadata.notes || (Array.isArray(normalizedMetadata.notes) && normalizedMetadata.notes.length === 0)) {
      try {
        // Try to find markdown file with datetime prefix
        const files = await fs.readdir(sessionDir);
        const noteFile = files.find((f: string) => f.endsWith('_notes.md')) || 'notes.md';
        const notePath = path.join(sessionDir, noteFile);
        normalizedMetadata.notes = await fs.readFile(notePath, 'utf-8');
      } catch {
        // No notes file found
        normalizedMetadata.notes = '';
      }
    }
    
    return normalizedMetadata;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Create session directory and default metadata if not exists
      console.log(`Creating session directory for ${sessionId}`);
      await fs.mkdir(sessionDir, { recursive: true });
      const defaultMetadata = {
        sessionId,
        startTime: Date.now(),
        endTime: null,
        duration: 0,
        notes: ''
      };
      await fs.writeFile(metadataPath, JSON.stringify(defaultMetadata, null, 2));
      return defaultMetadata;
    }
    console.error('Failed to load recording:', error);
    throw new Error(`Failed to load recording: ${error.message}`);
  }
});

ipcMain.handle('get-screenshots-in-range', async (_, sessionId: string, startTime: number, endTime: number, type: 'full' | 'thumb') => {
  const fs = require('fs');
  // Use unified recordings directory
  const unifiedRecordingsDir = getRecordingsDir();
  const screenshotDir = path.join(unifiedRecordingsDir, sessionId, 'screenshots');
  
  // Check if directory exists
  if (!fs.existsSync(screenshotDir)) {
    console.warn(`Screenshot directory not found for session ${sessionId} at ${screenshotDir}`);
    return [];
  }
  const suffix = type === 'full' ? '_full.png' : '_thumb.jpg';
  
  try {
    const files = fs.readdirSync(screenshotDir);
    const screenshots = files
      .filter((f: string) => f.endsWith(suffix))
      .map((f: string) => {
        // Try new pattern: YYYY_MM_DD_HH_mm_SS_<timestamp>_full.png or _thumb.jpg
        const newPatternMatch = f.match(/_(\d+)(_full\.png|_thumb\.jpg)$/);
        if (newPatternMatch) {
          return { file: f, timestamp: parseInt(newPatternMatch[1]) };
        }
        // Try legacy pattern: <timestamp>_full.png or _thumb.jpg
        const legacyMatch = f.match(/^(\d+)(_full\.png|_thumb\.jpg)$/);
        if (legacyMatch) {
          return { file: f, timestamp: parseInt(legacyMatch[1]) };
        }
        return null;
      })
      .filter(Boolean) as { file: string; timestamp: number }[];
    
    // Filter screenshots within the time range
    const screenshotsInRange = screenshots
      .filter(s => s.timestamp >= startTime && s.timestamp <= endTime)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(s => ({
        path: path.join(screenshotDir, s.file),
        timestamp: s.timestamp
      }));
    
    return screenshotsInRange;
  } catch (error) {
    console.error(`Error finding screenshots in range: ${error}`);
    return [];
  }
});

ipcMain.handle('get-screenshot-path', async (_, sessionId: string, timestamp: number, type: 'full' | 'thumb') => {
  const fs = require('fs');
  // Use unified recordings directory
  const unifiedRecordingsDir = getRecordingsDir();
  const screenshotDir = path.join(unifiedRecordingsDir, sessionId, 'screenshots');
  
  // Check if directory exists
  if (!fs.existsSync(screenshotDir)) {
    console.warn(`Screenshot directory not found for session ${sessionId} at ${screenshotDir}`);
    return '';
  }
  const suffix = type === 'full' ? '_full.png' : '_thumb.jpg';
  
  try {
    // First try exact match with legacy pattern
    const exactPath = path.join(screenshotDir, `${timestamp}${suffix}`);
    if (fs.existsSync(exactPath)) {
      return exactPath;
    }
    
    // Try to find exact match with new datetime prefix pattern
    const files = fs.readdirSync(screenshotDir);
    const exactNewPattern = files.find((f: string) => {
      // Match pattern: *_<timestamp>_full.png or *_<timestamp>_thumb.jpg
      const pattern = `_${timestamp}${suffix}`;
      return f.endsWith(pattern);
    });
    
    if (exactNewPattern) {
      return path.join(screenshotDir, exactNewPattern);
    }
    
    // If not found, find the closest screenshot
    const screenshots = files
      .filter((f: string) => f.endsWith(suffix))
      .map((f: string) => {
        // Try new pattern: YYYY_MM_DD_HH_mm_SS_<timestamp>_full.png or _thumb.jpg
        const newPatternMatch = f.match(/_(\d+)(_full\.png|_thumb\.jpg)$/);
        if (newPatternMatch) {
          return { file: f, timestamp: parseInt(newPatternMatch[1]) };
        }
        // Try legacy pattern: <timestamp>_full.png or _thumb.jpg
        const legacyMatch = f.match(/^(\d+)(_full\.png|_thumb\.jpg)$/);
        if (legacyMatch) {
          return { file: f, timestamp: parseInt(legacyMatch[1]) };
        }
        return null;
      })
      .filter(Boolean) as { file: string; timestamp: number }[];
    
    if (screenshots.length === 0) {
      console.error(`No screenshots found in ${screenshotDir}`);
      return '';
    }
    
    // Find the closest timestamp
    let closest = screenshots[0];
    let minDiff = Math.abs(closest.timestamp - timestamp);
    
    for (const screenshot of screenshots) {
      const diff = Math.abs(screenshot.timestamp - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = screenshot;
      }
    }
    
    const closestPath = path.join(screenshotDir, closest.file);
    // Only log if significant time difference
    if (minDiff > 1000) {
      console.log(`Using closest screenshot: ${closest.file} for timestamp ${timestamp} (diff: ${minDiff}ms)`);
    }
    return closestPath;
    
  } catch (error) {
    console.error(`Error finding screenshot: ${error}`);
    return '';
  }
});

// Expose settings to renderer
ipcMain.handle('get-recordings-dir', async () => {
  return getRecordingsDir();
});

// Configuration IPC handlers
ipcMain.handle('get-app-config', async () => {
  return configManager?.getAppConfig();
});

ipcMain.handle('get-config-values', async () => {
  return configManager?.getConfigValues();
});

ipcMain.handle('save-config-values', async (_, values: Record<string, string>) => {
  return configManager?.saveConfigValues(values);
});

ipcMain.handle('select-directory', async () => {
  return configManager?.selectDirectory();
});

ipcMain.handle('get-app-info', async () => {
  return configManager?.getAppInfo();
});