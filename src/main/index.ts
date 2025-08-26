import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import { WebSocketServer } from './websocket';
import { RecordingManager } from './recording';
import { ScreenshotManager } from './screenshot';
import { getRecordingsDir } from './config';
import { BackendManager } from './backend-manager';
import { ConfigManager } from './config-manager';
import { mainLogger } from './logger';

// Enable live reload for Electron in development
// Only load electron-reload in development and when not packaged
if (process.env.NODE_ENV === 'development' && !app.isPackaged) {
  try {
    // Path from dist/main to project root's node_modules
    const electronPath = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'electron');
    require('electron-reload')(path.join(__dirname, '..'), {
      electron: electronPath,
      hardResetMethod: 'exit'
    });
  } catch (error) {
    console.log('electron-reload not available in production');
  }
}

// Log application startup
mainLogger.info('Application starting', {
  version: app.getVersion(),
  platform: process.platform,
  isPackaged: app.isPackaged,
  appPath: app.getAppPath()
});

// Handle cleanup on process exit/restart
process.on('SIGINT', async () => {
  mainLogger.info('Received SIGINT, cleaning up...');
  if (wsServer) {
    await wsServer.stop();
    wsServer = null;
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  mainLogger.info('Received SIGTERM, cleaning up...');
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
  mainLogger.info('App is ready, initializing...');
  
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
        },
        { type: 'separator' },
        {
          label: 'View Logs',
          click: async () => {
            const { shell } = require('electron');
            const logPath = mainLogger.getLogPath();
            mainLogger.info('Opening log file', { logPath });
            shell.openPath(logPath);
          }
        },
        {
          label: 'Open Logs Folder',
          click: async () => {
            const { shell } = require('electron');
            const logDir = path.dirname(mainLogger.getLogPath());
            mainLogger.info('Opening logs folder', { logDir });
            shell.openPath(logDir);
          }
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
              width: 900,
              height: 700,
              minHeight: 600,
              titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
              webPreferences: {
                preload: path.join(__dirname, '../preload/index.js'),
                contextIsolation: true,
                nodeIntegration: false,
              },
            });

            const isDev = !app.isPackaged;
            const devBase = process.env.S2A_DEV_URL || 'http://localhost:3000';
            const devUrl = `${devBase}?page=settings`;
            const prodFile = path.join(__dirname, '../renderer/index.html');
            const fs = require('fs');

            const loadProd = () => {
              if (fs.existsSync(prodFile)) {
                mainLogger.info('Opening Settings window (prod file)', { prodFile });
                settingsWindow.loadFile(prodFile, { hash: 'settings' });
              } else {
                mainLogger.error('Prod renderer file missing; cannot open Settings from file', { prodFile });
              }
            };

            const loadDev = () => {
              mainLogger.info('Opening Settings window (dev url)', { devUrl });
              settingsWindow.loadURL(devUrl);
              // Dev tools removed - can be opened manually with Ctrl+Shift+I or Cmd+Opt+I
            };

            settingsWindow.webContents.on('did-finish-load', () => {
              mainLogger.info('Settings window did-finish-load');
            });
            settingsWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
              mainLogger.error('Settings window did-fail-load', { errorCode, errorDescription, validatedURL });
              if (validatedURL && validatedURL.startsWith('http')) {
                loadProd();
              } else if (validatedURL && validatedURL.startsWith('file:')) {
                loadDev();
              }
            });
            settingsWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
              mainLogger.info('Settings console', { level, message, line, sourceId });
            });

            if (isDev) {
              loadDev();
            } else {
              loadProd();
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
  mainLogger.info('Creating floating window...');
  createFloatingWindow();
  
  // Initialize managers
  mainLogger.info('Initializing managers...');
  try {
    wsServer = new WebSocketServer();
    mainLogger.info('WebSocketServer created');
    recordingManager = new RecordingManager();
    mainLogger.info('RecordingManager created');
    screenshotManager = new ScreenshotManager();
    mainLogger.info('ScreenshotManager created');
    backendManager = new BackendManager();
    mainLogger.info('BackendManager created');
    configManager = new ConfigManager();
    mainLogger.info('ConfigManager created');
  } catch (error) {
    mainLogger.error('Error initializing managers:', error);
    throw error;
  }

  // Diagnostics: list logs dir and expected backend log path
  try {
    const logsDir = path.dirname(mainLogger.getLogPath());
    const files = fs.existsSync(logsDir) ? fs.readdirSync(logsDir).filter(f => f.endsWith('.log')) : [];
    const hasBackendMgr = files.some(f => f.startsWith('backend-manager-'));
    const backendMgrLogPath = backendManager?.getLogPath();
    mainLogger.info('Diagnostics/logs', { logsDir, files, hasBackendMgr, backendMgrLogPath });
  } catch (e) {
    mainLogger.warn('Diagnostics/logs failed', { error: String(e) });
  }
  
  // IPC handler to get logs
  ipcMain.handle('get-logs', async () => {
    const logPath = mainLogger.getLogPath();
    mainLogger.info('Log path requested', { logPath });
    return {
      logPath,
      logDir: path.dirname(logPath)
    };
  });

  // IPC handler to open logs folder
  ipcMain.handle('open-logs-folder', async () => {
    const { shell } = require('electron');
    const logPath = mainLogger.getLogPath();
    const logDir = path.dirname(logPath);
    mainLogger.info('Opening logs folder', { logDir });
    shell.openPath(logDir);
    return logDir;
  });
  
  // Start WebSocket server for Python backend communication
  try {
    mainLogger.info('Starting WebSocket server on port 8765...');
    const wsStarted = await wsServer.start(8765);
    if (!wsStarted) {
      mainLogger.error('WebSocket server failed to start on port 8765');
      // Show a user-friendly error message
      dialog.showErrorBox(
        'WebSocket Server Error',
        'Failed to start WebSocket server on port 8765. The application may not function properly.'
      );
    } else {
      mainLogger.info('WebSocket server started successfully on port 8765');
    }
  } catch (error) {
    mainLogger.error('Error starting WebSocket server:', error);
    dialog.showErrorBox(
      'WebSocket Server Error',
      `Failed to start WebSocket server: ${error}`
    );
  }

  // Start Python backend (dev and prod). Allow opt-out with S2A_DISABLE_BACKEND=1
  const disableBackend = process.env.S2A_DISABLE_BACKEND === '1';
  const shouldStartBackend = !!backendManager && !disableBackend;
  mainLogger.info('Backend startup decision', {
    isPackaged: app.isPackaged,
    NODE_ENV: process.env.NODE_ENV,
    disableBackend,
    shouldStartBackend
  });
  
  if (shouldStartBackend) {
    try {
      mainLogger.info('Starting Python backend...');
      const backendStarted = await backendManager!.startBackend();
      if (!backendStarted) {
        mainLogger.error('Failed to start Python backend');
        await backendManager!.showBackendErrorDialog();
      } else {
        mainLogger.info('Python backend started successfully');
      }
    } catch (error) {
      mainLogger.error('Error starting Python backend:', error);
      await backendManager!.showBackendErrorDialog();
    }
  } else {
    mainLogger.info('Skipping backend startup', {
      reason: disableBackend ? 'S2A_DISABLE_BACKEND=1' : 'No backend manager'
    });
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

ipcMain.handle('resize-floating-window', async (_, width: number, height: number) => {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    // Get current window bounds to preserve position
    const bounds = floatingWindow.getBounds();
    
    // Animate the resize for smooth transition
    floatingWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: width,
      height: height
    }, true); // true enables animation on macOS
    
    return true;
  }
  return false;
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
  try {
    mainLogger.info('Getting desktop sources...');
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
    });
    mainLogger.info(`Found ${sources.length} sources`);
    
    // If no sources found, it might be a permissions issue
    if (sources.length === 0) {
      mainLogger.warn('No sources found - check screen recording permissions');
      // On macOS, prompt for screen recording permission
      if (process.platform === 'darwin') {
        const { systemPreferences } = require('electron');
        const screenAccess = systemPreferences.getMediaAccessStatus('screen');
        mainLogger.info('Screen recording permission status:', screenAccess);
        
        if (screenAccess !== 'granted') {
          dialog.showErrorBox(
            'Screen Recording Permission Required',
            'Screen2Action needs screen recording permission to capture your screen.\n\n' +
            'Please grant permission in System Settings > Privacy & Security > Screen Recording, ' +
            'then restart the application.'
          );
        }
      }
    }
    
    return sources;
  } catch (error) {
    mainLogger.error('Failed to get desktop sources:', error);
    
    // Show user-friendly error message
    if (process.platform === 'darwin') {
      dialog.showErrorBox(
        'Screen Recording Permission Required',
        'Screen2Action needs screen recording permission to capture your screen.\n\n' +
        'Please grant permission in:\n' +
        'System Settings > Privacy & Security > Screen Recording\n\n' +
        'Then restart Screen2Action.'
      );
    }
    
    throw new Error('Failed to get sources. Please check screen recording permissions.');
  }
});

ipcMain.handle('start-recording', async (_, screenId: string) => {
  if (recordingManager) {
    const sessionId = await recordingManager.startRecording(screenId);

    // Switch main logger and backend-manager logger to session folder
    try {
      mainLogger.useSession(sessionId);
    } catch {}
    try {
      backendManager?.setSession(sessionId);
    } catch {}
    
    // Also start audio recording in Python backend
    if (wsServer) {
      try {
        mainLogger.info('Sending start_recording to backend', { sessionId, screenId });
        await wsServer.sendMessage({
          type: 'command',
          action: 'start_recording',
          payload: {
            sessionId,
            screenId
          }
        });
        mainLogger.info('Started audio recording in backend for session:', sessionId);
      } catch (error: any) {
        mainLogger.warn('Python backend not connected for audio recording:', error.message);
        // Continue without audio if backend is not connected
        // The recording will still work, just without audio
      }
    } else {
      mainLogger.warn('WebSocket server not available for audio recording');
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
        mainLogger.info('Sending stop_recording to backend');
        await wsServer.sendMessage({
          type: 'command',
          action: 'stop_recording',
          payload: {}
        });
        mainLogger.info('Stopped audio recording in backend');
      } catch (error: any) {
        mainLogger.warn('Python backend not connected for stopping audio:', error.message);
      }
    } else {
      mainLogger.warn('WebSocket server not available for stopping audio recording');
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

ipcMain.handle('copy-screenshot', async (_, idOrPath: string) => {
  if (screenshotManager) {
    const { nativeImage, clipboard } = require('electron');
    // If it's a file path, copy directly from the path
    if (idOrPath.includes('/') || idOrPath.includes('\\')) {
      const image = nativeImage.createFromPath(idOrPath);
      clipboard.writeImage(image);
    } else {
      // Otherwise, treat it as an ID
      await screenshotManager.copyToClipboard(idOrPath);
    }
  } else {
    throw new Error('Screenshot manager not initialized');
  }
});

ipcMain.handle('save-screenshot', async (_, id: string, relativePath: string) => {
  if (screenshotManager) {
    const fs = require('fs');
    const path = require('path');
    
    // Get the full path to user_screenshots directory
    const userScreenshotsDir = path.join(app.getPath('documents'), 'Screen2Action', 'user_screenshots');
    const fullPath = path.join(userScreenshotsDir, path.basename(relativePath));
    
    // Return the full path
    return fullPath;
  }
  throw new Error('Screenshot manager not initialized');
});

ipcMain.handle('send-to-ai', async (_, data: any) => {
  mainLogger.info('Received AI command:', data);
  if (!wsServer) {
    mainLogger.error('WebSocket server not initialized when handling send-to-ai');
    throw new Error('WebSocket server not initialized. Please restart the application.');
  }
  
  try {
    // Wait for backend connection to avoid race
    const ok = await wsServer.waitForBackendConnected(15000);
    if (!ok) {
      mainLogger.error('Backend connection timeout after 15 seconds');
      throw new Error('No connected Python backend. Please check if the backend is running.');
    }
    
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
    
    mainLogger.info('Sending to backend:', message);
    const result = await wsServer.sendMessage(message);
    mainLogger.info('Backend response:', result);
    return result;
  } catch (error) {
    mainLogger.error('Error in send-to-ai handler:', error);
    throw error;
  }
});

ipcMain.handle('enhance-note', async (_, data: any) => {
  if (!wsServer) {
    mainLogger.error('WebSocket server not initialized when handling enhance-note');
    throw new Error('WebSocket server not initialized. Please restart the application.');
  }
  
  try {
    const ok = await wsServer.waitForBackendConnected(15000);
    if (!ok) {
      mainLogger.error('Backend connection timeout for enhance-note');
      throw new Error('No connected Python backend. Please check if the backend is running.');
    }
    
    return await wsServer.sendMessage({
      type: 'request',
      action: 'enhance_note',
      payload: data,
    });
  } catch (error) {
    mainLogger.error('Error in enhance-note handler:', error);
    throw error;
  }
});

ipcMain.handle('process-mcp', async (_, data: any) => {
  if (!wsServer) {
    mainLogger.error('WebSocket server not initialized when handling process-mcp');
    throw new Error('WebSocket server not initialized. Please restart the application.');
  }
  
  try {
    const ok = await wsServer.waitForBackendConnected(15000);
    if (!ok) {
      mainLogger.error('Backend connection timeout for process-mcp');
      throw new Error('No connected Python backend. Please check if the backend is running.');
    }
    
    return await wsServer.sendMessage({
      type: 'request',
      action: 'process_mcp',
      payload: data,
    });
  } catch (error) {
    mainLogger.error('Error in process-mcp handler:', error);
    throw error;
  }
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