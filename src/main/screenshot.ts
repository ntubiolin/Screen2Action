import { desktopCapturer, screen, clipboard, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ScreenshotOptions {
  fullScreen?: boolean;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export class ScreenshotManager {
  private screenshotsDir: string;

  constructor() {
    this.screenshotsDir = path.join(process.cwd(), 'screenshots');
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }
  }

  async capture(options: ScreenshotOptions = {}): Promise<string> {
    const screenshotId = uuidv4();
    const screenshotDir = path.join(this.screenshotsDir, screenshotId);
    fs.mkdirSync(screenshotDir);

    try {
      let screenshot: Electron.NativeImage;

      if (options.fullScreen !== false) {
        // Capture full screen
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: screen.getPrimaryDisplay().workAreaSize,
        });

        if (sources.length === 0) {
          throw new Error('No screen sources available');
        }

        screenshot = sources[0].thumbnail;
      } else if (options.region) {
        // Capture specific region (would need additional implementation)
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: screen.getPrimaryDisplay().workAreaSize,
        });

        if (sources.length === 0) {
          throw new Error('No screen sources available');
        }

        // Crop to region
        screenshot = sources[0].thumbnail.crop(options.region);
      } else {
        throw new Error('Invalid screenshot options');
      }

      // Save original screenshot
      const originalPath = path.join(screenshotDir, 'original.png');
      fs.writeFileSync(originalPath, screenshot.toPNG());

      // Create metadata
      const metadata = {
        id: screenshotId,
        timestamp: new Date().toISOString(),
        options,
        originalPath,
        annotations: [],
      };

      fs.writeFileSync(
        path.join(screenshotDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      return screenshotId;
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(screenshotDir)) {
        fs.rmSync(screenshotDir, { recursive: true });
      }
      throw error;
    }
  }

  async copyToClipboard(screenshotId: string): Promise<void> {
    const imagePath = path.join(this.screenshotsDir, screenshotId, 'original.png');
    
    if (!fs.existsSync(imagePath)) {
      throw new Error('Screenshot not found');
    }

    const image = nativeImage.createFromPath(imagePath);
    clipboard.writeImage(image);
  }

  async saveToFile(screenshotId: string, destinationPath: string): Promise<void> {
    const sourcePath = path.join(this.screenshotsDir, screenshotId, 'original.png');
    
    if (!fs.existsSync(sourcePath)) {
      throw new Error('Screenshot not found');
    }

    fs.copyFileSync(sourcePath, destinationPath);
  }

  getScreenshotPath(screenshotId: string): string {
    return path.join(this.screenshotsDir, screenshotId);
  }
}