import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';

function expandHome(p: string): string {
  if (!p) return p;
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return p;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Cache the recordings directory to avoid repeated calculations
let cachedRecordingsDir: string | null = null;

export function getRecordingsDir(): string {
  // Return cached value if available
  if (cachedRecordingsDir) {
    return cachedRecordingsDir;
  }

  // Only log on first call
  // 1) Environment variable has highest priority
  const envDir = process.env.S2A_RECORDINGS_DIR;
  
  if (envDir && envDir.trim()) {
    const resolved = path.resolve(expandHome(envDir.trim()));
    ensureDir(resolved);
    cachedRecordingsDir = resolved;
    console.log(`Recordings directory: ${resolved} (from environment variable)`);
    return resolved;
  }

  // 2) Try to read from config/app.json - check multiple locations (repo root, app path, compiled path)
  const possibleConfigPaths = [
    path.join(process.cwd(), 'config', 'app.json'),
    path.join(app.getAppPath(), 'config', 'app.json'),
    path.join(__dirname, '..', '..', 'config', 'app.json'),
  ];
  
  for (const configPath of possibleConfigPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const json = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (json && typeof json.recordingsDir === 'string' && json.recordingsDir.trim()) {
          const resolved = path.resolve(expandHome(json.recordingsDir.trim()));
          ensureDir(resolved);
          cachedRecordingsDir = resolved;
          console.log(`Recordings directory: ${resolved} (from config file)`);
          return resolved;
        }
      }
    } catch (err) {
      // Silently continue to next path
    }
  }

  // 3) Fallback to Documents/Screen2Action/recordings
  const fallback = path.join(app.getPath('documents'), 'Screen2Action', 'recordings');
  ensureDir(fallback);
  cachedRecordingsDir = fallback;
  console.log(`Recordings directory: ${fallback} (fallback)`);
  return fallback;
}
