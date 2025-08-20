import { spawn, ChildProcess } from 'child_process';
import { app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger';

export class BackendManager {
  private backendProcess: ChildProcess | null = null;
  private isProduction = app.isPackaged;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('backend-manager');
    this.logger.info('BackendManager initialized', {
      isProduction: this.isProduction,
      isPackaged: app.isPackaged,
      NODE_ENV: process.env.NODE_ENV,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath
    });
  }

  /** Rotate logger into session folder */
  setSession(sessionId: string) {
    try {
      this.logger.useSession(sessionId);
    } catch (e) {
      this.logger.warn('Failed to switch backend-manager logger to session', { error: String(e) });
    }
  }

  /**
   * Start the Python backend server
   */
  async startBackend(): Promise<boolean> {
    try {
      const backendPath = this.getBackendPath();
      const startupScript = path.join(backendPath, 'start_backend.py');

      this.logger.info('Starting backend', {
        backendPath,
        startupScript,
        exists: fs.existsSync(startupScript),
        isProduction: this.isProduction
      });

      // In production, use the bundled startup script
      if (this.isProduction && fs.existsSync(startupScript)) {
        this.logger.info('Using production startup script');
        this.backendProcess = spawn('python3', [startupScript], {
          cwd: backendPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });
      } else {
        // Development mode - use the development startup
        const runScript = path.join(backendPath, 'run.py');
        
        // Try to use uv first, fall back to python
        const pythonCmd = this.findPythonExecutable(backendPath);
        this.logger.info('Using development mode', {
          runScript,
          pythonCmd,
          scriptExists: fs.existsSync(runScript)
        });
        this.backendProcess = spawn(pythonCmd, [runScript], {
          cwd: backendPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });
      }

      if (this.backendProcess) {
        this.logger.info('Backend process spawned', { pid: this.backendProcess.pid });
        this.setupBackendListeners();
        
        // Wait a bit to see if the process starts successfully
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const isRunning = !this.backendProcess.killed;
        this.logger.info('Backend startup check', { isRunning, pid: this.backendProcess.pid });
        return isRunning;
      }

      this.logger.error('Failed to spawn backend process');
      return false;
    } catch (error) {
      this.logger.error('Failed to start backend', error);
      return false;
    }
  }

  /**
   * Stop the backend server
   */
  async stopBackend(): Promise<void> {
    if (this.backendProcess && !this.backendProcess.killed) {
      this.logger.info('Stopping backend', { pid: this.backendProcess.pid });
      this.backendProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown, then force kill if needed
      setTimeout(() => {
        if (this.backendProcess && !this.backendProcess.killed) {
          this.logger.warn('Force killing backend process');
          this.backendProcess.kill('SIGKILL');
        }
      }, 5000);
      
      this.backendProcess = null;
    }
  }

  /**
   * Check if backend is running
   */
  isBackendRunning(): boolean {
    return this.backendProcess !== null && !this.backendProcess.killed;
  }

  /**
   * Get the path to the backend directory
   */
  private getBackendPath(): string {
    let backendPath: string;
    if (this.isProduction) {
      // In production, backend is in extraResources
      backendPath = path.join(process.resourcesPath, 'backend');
    } else {
      // In development, backend is in the project root
      backendPath = path.join(app.getAppPath(), 'backend');
    }
    
    this.logger.debug('Backend path resolved', {
      backendPath,
      exists: fs.existsSync(backendPath),
      contents: fs.existsSync(backendPath) ? fs.readdirSync(backendPath).slice(0, 10) : []
    });
    
    return backendPath;
  }

  /**
   * Find the appropriate Python executable
   */
  private findPythonExecutable(backendPath: string): string {
    // Check for virtual environment first
    const venvPaths = [
      path.join(backendPath, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', 'python'),
      path.join(backendPath, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin', 'python')
    ];

    for (const venvPath of venvPaths) {
      if (fs.existsSync(venvPath) || fs.existsSync(venvPath + '.exe')) {
        this.logger.info('Found Python in venv', { path: venvPath });
        return venvPath;
      }
    }

    // Fall back to system Python
    const systemPython = process.platform === 'win32' ? 'python' : 'python3';
    this.logger.info('Using system Python', { command: systemPython });
    return systemPython;
  }

  /**
   * Set up listeners for backend process
   */
  private setupBackendListeners(): void {
    if (!this.backendProcess) return;

    this.backendProcess.stdout?.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        this.logger.info('[Backend stdout]', message);
      }
    });

    this.backendProcess.stderr?.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        this.logger.error('[Backend stderr]', message);
      }
    });

    this.backendProcess.on('close', (code) => {
      this.logger.info('Backend process closed', { code });
      this.backendProcess = null;
    });

    this.backendProcess.on('error', (error) => {
      this.logger.error('Backend process error', error);
    });
  }

  /**
   * Show backend error dialog
   */
  async showBackendErrorDialog(): Promise<void> {
    await dialog.showErrorBox(
      'Backend Error',
      'Failed to start the Python backend server. Please ensure Python 3.10+ is installed and try restarting the application.'
    );
  }
}