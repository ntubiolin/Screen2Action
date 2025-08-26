import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

function expandHome(p: string): string {
  if (!p) return p;
  if (p.startsWith('~')) {
    return path.join(app.getPath('home'), p.slice(1));
  }
  return p;
}

function getBaseLogsDir(): string {
  // Allow override via env
  const envDir = process.env.S2A_LOGS_DIR && process.env.S2A_LOGS_DIR.trim();
  if (envDir) {
    const resolved = path.resolve(expandHome(envDir));
    try { fs.mkdirSync(resolved, { recursive: true }); } catch {}
    return resolved;
  }

  // macOS: use unified lower-case app dir to match Python backend
  if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Application Support', 'screen2action', 'logs');
  }

  // Windows: use AppData\Roaming\screen2action\logs
  if (process.platform === 'win32') {
    return path.join(app.getPath('appData'), 'screen2action', 'logs');
  }

  // Linux/others: ~/.local/share/screen2action/logs
  return path.join(app.getPath('home'), '.local', 'share', 'screen2action', 'logs');
}

export class Logger {
  private logFile: string;
  private logStream: fs.WriteStream | null = null;
  private sessionId: string | null = null;
  // Keep the original logger name to preserve filenames across session switches
  private name: string;

  constructor(name: string = 'main', sessionId?: string) {
    this.name = name;
    // Create logs directory (unified path shared with Python)
    const logsDir = getBaseLogsDir();
    
    // If sessionId is provided, create a session-specific subdirectory
    let logPath = logsDir;
    if (sessionId) {
      this.sessionId = sessionId;
      logPath = path.join(logsDir, 'sessions', sessionId);
    }
    
    if (!fs.existsSync(logPath)) {
      fs.mkdirSync(logPath, { recursive: true });
    }

    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(logPath, `${this.name}-${timestamp}.log`);
    
    // Create write stream
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    
    this.log('info', `Logger initialized. Log file: ${this.logFile}`);
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + JSON.stringify(args) : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}\n`;
  }

  private writeToFile(message: string) {
    if (this.logStream && !this.logStream.destroyed) {
      this.logStream.write(message);
    }
  }

  log(level: string, message: string, ...args: any[]) {
    const formattedMessage = this.formatMessage(level, message, ...args);
    
    // Write to file
    this.writeToFile(formattedMessage);
    
    // Also log to console
    switch (level.toLowerCase()) {
      case 'error':
        console.error(message, ...args);
        break;
      case 'warn':
        console.warn(message, ...args);
        break;
      default:
        console.log(message, ...args);
    }
  }

  info(message: string, ...args: any[]) {
    this.log('info', message, ...args);
  }

  error(message: string, ...args: any[]) {
    this.log('error', message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.log('warn', message, ...args);
  }

  debug(message: string, ...args: any[]) {
    this.log('debug', message, ...args);
  }

  getLogPath(): string {
    return this.logFile;
  }

  close() {
    if (this.logStream && !this.logStream.destroyed) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
    // Optionally create a new log file for the session
    this.info(`Session ID set: ${sessionId}`);
  }

  /**
   * Switch this logger to write into the session folder.
   * Closes current stream and re-opens under logs/sessions/<sessionId>/
   */
  useSession(sessionId: string) {
    try {
      const logsDir = getBaseLogsDir();
      const sessionDir = path.join(logsDir, 'sessions', sessionId);
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      // Close previous stream
      if (this.logStream && !this.logStream.destroyed) {
        this.logStream.end();
      }
      this.sessionId = sessionId;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      // Preserve the full logger name (e.g., 'backend-manager')
      const name = this.name || 'log';
      this.logFile = path.join(sessionDir, `${name}-${timestamp}.log`);
      this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
      this.info('Logger switched to session log file', { sessionId, logFile: this.logFile });
    } catch (e) {
      // Fallback: keep existing stream but note failure
      this.warn('Failed to switch logger to session directory', { error: String(e) });
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}

// Create singleton instance
export const mainLogger = new Logger('main');

// Factory function to create session-specific loggers
export function createSessionLogger(name: string, sessionId: string): Logger {
  return new Logger(name, sessionId);
}