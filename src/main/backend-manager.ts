import { spawn, ChildProcess } from 'child_process';
import { app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export class BackendManager {
  private backendProcess: ChildProcess | null = null;
  private isProduction = !process.env.NODE_ENV || process.env.NODE_ENV === 'production';

  constructor() {}

  /**
   * Start the Python backend server
   */
  async startBackend(): Promise<boolean> {
    try {
      const backendPath = this.getBackendPath();
      const startupScript = path.join(backendPath, 'start_backend.py');

      console.log('Starting backend from:', backendPath);

      // In production, use the bundled startup script
      if (this.isProduction && fs.existsSync(startupScript)) {
        this.backendProcess = spawn('python3', [startupScript], {
          cwd: backendPath,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } else {
        // Development mode - use the development startup
        const runScript = path.join(backendPath, 'run.py');
        
        // Try to use uv first, fall back to python
        const pythonCmd = this.findPythonExecutable(backendPath);
        this.backendProcess = spawn(pythonCmd, [runScript], {
          cwd: backendPath,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      }

      if (this.backendProcess) {
        this.setupBackendListeners();
        
        // Wait a bit to see if the process starts successfully
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return !this.backendProcess.killed;
      }

      return false;
    } catch (error) {
      console.error('Failed to start backend:', error);
      return false;
    }
  }

  /**
   * Stop the backend server
   */
  async stopBackend(): Promise<void> {
    if (this.backendProcess && !this.backendProcess.killed) {
      this.backendProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown, then force kill if needed
      setTimeout(() => {
        if (this.backendProcess && !this.backendProcess.killed) {
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
    if (this.isProduction) {
      // In production, backend is in extraResources
      return path.join(process.resourcesPath, 'backend');
    } else {
      // In development, backend is in the project root
      return path.join(app.getAppPath(), 'backend');
    }
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
        return venvPath;
      }
    }

    // Fall back to system Python
    return process.platform === 'win32' ? 'python' : 'python3';
  }

  /**
   * Set up listeners for backend process
   */
  private setupBackendListeners(): void {
    if (!this.backendProcess) return;

    this.backendProcess.stdout?.on('data', (data) => {
      console.log('Backend stdout:', data.toString());
    });

    this.backendProcess.stderr?.on('data', (data) => {
      console.error('Backend stderr:', data.toString());
    });

    this.backendProcess.on('close', (code) => {
      console.log('Backend process closed with code:', code);
      this.backendProcess = null;
    });

    this.backendProcess.on('error', (error) => {
      console.error('Backend process error:', error);
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