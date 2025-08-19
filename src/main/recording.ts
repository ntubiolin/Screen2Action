import { desktopCapturer, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getRecordingsDir } from './config';

export class RecordingManager {
  private floatingWindow: BrowserWindow | null = null;

  setFloatingWindow(window: BrowserWindow | null) {
    this.floatingWindow = window;
  }

  // No-op: with content protection enabled on the floating window,
  // we no longer need to hide it before screenshots.
  private async hideFloatingWindow(): Promise<void> {
    // ...existing code...
    return;
  }

  // No-op: avoid showing/focusing/forcing always-on-top to prevent flicker.
  private async showFloatingWindow(): Promise<void> {
    // ...existing code...
    return;
  }

  private isRecording = false;
  private sessionId: string | null = null;
  private screenshotInterval: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private sessionPath: string = '';

  async startRecording(screenId: string): Promise<string> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    this.sessionId = uuidv4();
    this.startTime = Date.now();
    this.isRecording = true;
    
    // Create session directory using unified recordings dir
    const recordingsDir = getRecordingsDir();
    this.sessionPath = path.join(recordingsDir, this.sessionId);
    
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }
    fs.mkdirSync(this.sessionPath, { recursive: true });
    fs.mkdirSync(path.join(this.sessionPath, 'screenshots'), { recursive: true });
    fs.mkdirSync(path.join(this.sessionPath, 'audio'), { recursive: true });
    
    // Initialize metadata
    const metadata = {
      id: this.sessionId,
      startTime: new Date(this.startTime).toISOString(),
      screenId,
      notes: [],
    };
    
    fs.writeFileSync(
      path.join(this.sessionPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    // Start periodic screenshots
    this.startScreenshotCapture();
    
    return this.sessionId;
  }

  async stopRecording(): Promise<{ duration: number; sessionId: string | null }> {
    if (!this.isRecording) {
      throw new Error('Not recording');
    }

    // Take a final screenshot before stopping (best-effort)
    try {
      // No need to hide floating window due to content protection
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
      });
      if (sources.length > 0) {
        const finalTimestamp = Date.now() - this.startTime;
        const screenshot = sources[0].thumbnail;
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const prefix = `${now.getFullYear()}_${pad(now.getMonth()+1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`;
        const fullPath = path.join(
          this.sessionPath,
            'screenshots',
            `${prefix}_${finalTimestamp}_full.png`
        );
        const thumbPath = path.join(
          this.sessionPath,
          'screenshots',
          `${prefix}_${finalTimestamp}_thumb.jpg`
        );
        try { fs.writeFileSync(fullPath, screenshot.toPNG()); } catch {}
        try { fs.writeFileSync(thumbPath, screenshot.resize({ width: 320, height: 180 }).toJPEG(80)); } catch {}
      }
      // No need to restore/show floating window
    } catch (e) {
      console.warn('Final screenshot capture failed:', e);
    }

    this.isRecording = false;

    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
    }

    // Update metadata with end time
    const metadataPath = path.join(this.sessionPath, 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    metadata.endTime = new Date().toISOString();
    metadata.duration = Date.now() - this.startTime;
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    const duration = metadata.duration;
    const sessionId = this.sessionId;

    this.sessionId = null;
    this.startTime = 0;

    return { duration, sessionId };
  }

  private startScreenshotCapture() {
    // Capture screenshot every 30 seconds
    this.screenshotInterval = setInterval(async () => {
      if (!this.isRecording) return;
      
      try {
        // No need to hide floating window due to content protection
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1920, height: 1080 },
        });
        
        if (sources.length > 0) {
          const timestamp = Date.now() - this.startTime;
          const screenshot = sources[0].thumbnail;
          
          // Create datetime prefix
          const now = new Date();
          const pad = (n: number) => n.toString().padStart(2, '0');
          const prefix = `${now.getFullYear()}_${pad(now.getMonth()+1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`;
          
          // Save full screenshot with datetime prefix
          const fullPath = path.join(
            this.sessionPath,
            'screenshots',
            `${prefix}_${timestamp}_full.png`
          );
          
          fs.writeFileSync(fullPath, screenshot.toPNG());
          
          // Save thumbnail with datetime prefix
          const thumb = screenshot.resize({ width: 320, height: 180 });
          const thumbPath = path.join(
            this.sessionPath,
            'screenshots',
            `${prefix}_${timestamp}_thumb.jpg`
          );
          
          fs.writeFileSync(thumbPath, thumb.toJPEG(80));
        }
        
        // No need to show floating window
      } catch (error) {
        console.error('Screenshot capture error:', error);
      }
    }, 10000); // 10 seconds
  }

  getSessionPath(): string {
    return this.sessionPath;
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  getCurrentSessionId(): string | null {
    return this.sessionId;
  }
}