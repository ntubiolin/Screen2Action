import { desktopCapturer, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class RecordingManager {
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
    
    // Create session directory
    const recordingsDir = path.join(process.cwd(), 'recordings');
    this.sessionPath = path.join(recordingsDir, this.sessionId);
    
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }
    fs.mkdirSync(this.sessionPath);
    fs.mkdirSync(path.join(this.sessionPath, 'screenshots'));
    fs.mkdirSync(path.join(this.sessionPath, 'audio'));
    
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

  async stopRecording(): Promise<void> {
    if (!this.isRecording) {
      throw new Error('Not recording');
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
    
    this.sessionId = null;
    this.startTime = 0;
  }

  private startScreenshotCapture() {
    // Capture screenshot every 30 seconds
    this.screenshotInterval = setInterval(async () => {
      if (!this.isRecording) return;
      
      try {
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