/**
 * Frontend logging utility that captures console output
 */

class FrontendLogger {
  private logs: Array<{ timestamp: string; level: string; message: string; data?: any }> = [];
  private originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
  };

  constructor() {
    this.interceptConsole();
    this.setupErrorHandlers();
  }

  private interceptConsole() {
    // Override console methods to capture logs
    console.log = (...args: any[]) => {
      this.capture('log', args);
      this.originalConsole.log(...args);
    };

    console.error = (...args: any[]) => {
      this.capture('error', args);
      this.originalConsole.error(...args);
    };

    console.warn = (...args: any[]) => {
      this.capture('warn', args);
      this.originalConsole.warn(...args);
    };

    console.info = (...args: any[]) => {
      this.capture('info', args);
      this.originalConsole.info(...args);
    };

    console.debug = (...args: any[]) => {
      this.capture('debug', args);
      this.originalConsole.debug(...args);
    };
  }

  private setupErrorHandlers() {
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.capture('error', [
        'Unhandled error:',
        event.message,
        'at',
        event.filename,
        event.lineno + ':' + event.colno,
        event.error
      ]);
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.capture('error', [
        'Unhandled promise rejection:',
        event.reason
      ]);
    });
  }

  private capture(level: string, args: any[]) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    const logEntry = {
      timestamp,
      level,
      message,
      data: args.length > 1 ? args : undefined
    };

    this.logs.push(logEntry);

    // Keep only last 1000 logs to prevent memory issues
    if (this.logs.length > 1000) {
      this.logs.shift();
    }

    // Send important logs to main process
    if (level === 'error' || level === 'warn') {
      this.sendToMain(logEntry);
    }
  }

  private async sendToMain(logEntry: any) {
    try {
      // Send log to main process via IPC
      if (window.electron?.sendToAI) {
        await window.electron.sendToAI({
          type: 'frontend-log',
          ...logEntry
        });
      }
    } catch (error) {
      // Silently fail to avoid infinite loop
    }
  }

  public getLogs() {
    return this.logs;
  }

  public downloadLogs() {
    const logsText = this.logs.map(log => 
      `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');

    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frontend-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public clearLogs() {
    this.logs = [];
  }
}

// Create singleton instance
export const frontendLogger = new FrontendLogger();

// Export utility functions
export const downloadLogs = () => frontendLogger.downloadLogs();
export const getLogs = () => frontendLogger.getLogs();
export const clearLogs = () => frontendLogger.clearLogs();