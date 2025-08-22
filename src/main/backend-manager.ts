import { spawn, ChildProcess } from 'child_process';
import { app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Logger, mainLogger } from './logger';

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
    // Mirror path to main log for debugging visibility
    try {
      mainLogger.info('BackendManager logger path', { logPath: this.logger.getLogPath() });
    } catch {}
  }

  /** Expose current log file path for debugging */
  getLogPath(): string {
    return this.logger.getLogPath();
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

      // Prefer bundled single-file binary in production (Plan A)
      const platform = process.platform;
      const arch = process.arch; // 'arm64' | 'x64' | ...
      const binaryBaseName = platform === 'win32' ? 'Screen2ActionBackend.exe' : 'Screen2ActionBackend';

      // Try arch-specific paths first (helps when both binaries are shipped)
      const candidateBinaryPaths: string[] = [];
      if (platform === 'darwin') {
        // On macOS, try both arm64 and x64 paths as Electron might report different arch
        candidateBinaryPaths.push(path.join(backendPath, 'bin', `darwin-arm64`, binaryBaseName));
        candidateBinaryPaths.push(path.join(backendPath, 'bin', `darwin-x64`, binaryBaseName));
        candidateBinaryPaths.push(path.join(backendPath, 'bin', `darwin-${arch}`, binaryBaseName));
      } else if (platform === 'linux') {
        candidateBinaryPaths.push(path.join(backendPath, 'bin', `linux-${arch}`, binaryBaseName));
      } else if (platform === 'win32') {
        candidateBinaryPaths.push(path.join(backendPath, 'bin', `win32-${arch}`, binaryBaseName));
      }
      // Generic bin fallback
      candidateBinaryPaths.push(path.join(backendPath, 'bin', binaryBaseName));

      const startupScript = path.join(backendPath, 'start_backend.py');

      const binaryPath = candidateBinaryPaths.find(p => fs.existsSync(p));

      this.logger.info('Starting backend', {
        backendPath,
        candidateBinaryPaths,
        selectedBinary: binaryPath,
        startupScript,
        scriptExists: fs.existsSync(startupScript),
        isProduction: this.isProduction
      });

      if (this.isProduction) {
        if (binaryPath) {
          this.logger.info('Using production bundled backend binary', { binaryPath });
          this.backendProcess = spawn(binaryPath, [], {
            cwd: backendPath,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
          });
        } else if (fs.existsSync(startupScript)) {
          // Fallback to previous python startup method
          this.logger.info('Bundled binary not found, falling back to python startup script');
          this.backendProcess = spawn('python3', [startupScript], {
            cwd: backendPath,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
          });
        } else {
          this.logger.error('No production backend found (neither binary nor startup script)');
          return false;
        }
      } else {
        // Development mode - use the development startup
        const runScript = path.join(backendPath, 'run.py');
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