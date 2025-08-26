import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Helper class for managing Electron app lifecycle during E2E tests
 */
export class ElectronAppHelper {
  private app: ElectronApplication | null = null;
  private page: Page | null = null;
  private backendProcess: ChildProcess | null = null;
  
  /**
   * Start the Python backend server
   */
  async startBackend(): Promise<void> {
    return new Promise((resolve, reject) => {
      const backendPath = path.join(__dirname, '../../backend');
      
      // Check if backend is already running on port 8765 or 8766
      const checkPort8765 = spawn('lsof', ['-Pi', ':8765', '-sTCP:LISTEN', '-t']);
      
      checkPort8765.on('exit', async (code8765) => {
        if (code8765 === 0) {
          console.log('✅ Backend already running on port 8765');
          resolve();
          return;
        }
        
        // Check port 8766 as well
        const checkPort8766 = spawn('lsof', ['-Pi', ':8766', '-sTCP:LISTEN', '-t']);
        
        checkPort8766.on('exit', (code8766) => {
          if (code8766 === 0) {
            console.log('✅ Backend already running on port 8766');
            resolve();
            return;
          }
          
          console.log('Starting Python backend...');
          
          // Start the backend
          this.backendProcess = spawn('python', ['run.py'], {
            cwd: backendPath,
            stdio: 'pipe',
            env: { ...process.env }
          });
          
          // Wait for backend to be ready
          let backendReady = false;
          const checkBackend = setInterval(async () => {
            try {
              // Try port 8765 first
              let response = await fetch('http://localhost:8765/health');
              if (response.ok) {
                clearInterval(checkBackend);
                if (!backendReady) {
                  backendReady = true;
                  console.log('✅ Backend started successfully on port 8765');
                  resolve();
                }
                return;
              }
            } catch (e) {
              // Try port 8766
              try {
                const response = await fetch('http://localhost:8766/health');
                if (response.ok) {
                  clearInterval(checkBackend);
                  if (!backendReady) {
                    backendReady = true;
                    console.log('✅ Backend started successfully on port 8766');
                    resolve();
                  }
                }
              } catch (e2) {
                // Backend not ready yet on either port
              }
            }
          }, 1000);
        
          // Timeout after 30 seconds
          setTimeout(() => {
            if (!backendReady) {
              clearInterval(checkBackend);
              this.stopBackend();
              reject(new Error('Backend failed to start within 30 seconds'));
            }
          }, 30000);
          
          // Handle backend errors
          this.backendProcess.on('error', (error) => {
            clearInterval(checkBackend);
            reject(new Error(`Backend process error: ${error.message}`));
          });
          
          // Log backend output for debugging
          this.backendProcess.stdout?.on('data', (data) => {
            console.log(`[Backend] ${data.toString()}`);
          });
          
          this.backendProcess.stderr?.on('data', (data) => {
            console.error(`[Backend Error] ${data.toString()}`);
          });
        });
      });
    });
  }
  
  /**
   * Stop the Python backend server
   */
  async stopBackend(): Promise<void> {
    if (this.backendProcess) {
      console.log('Stopping backend...');
      this.backendProcess.kill('SIGTERM');
      this.backendProcess = null;
    }
  }
  
  /**
   * Launch the Electron application
   */
  async launch(): Promise<{ app: ElectronApplication; page: Page }> {
    // Build the app first if not already built
    const distPath = path.join(__dirname, '../../dist');
    if (!fs.existsSync(distPath)) {
      console.log('Building Electron app...');
      await this.buildApp();
    }
    
    // Launch Electron
    console.log('Launching Electron app...');
    this.app = await electron.launch({
      args: ['.'],
      cwd: path.join(__dirname, '../..'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PLAYWRIGHT_TEST: 'true'
      }
    });
    
    // Wait for the first window
    this.page = await this.app.firstWindow();
    
    // Wait for the app to be ready
    await this.page.waitForLoadState('domcontentloaded');
    
    // Add console log listener for debugging
    this.page.on('console', (msg) => {
      console.log(`[App Console] ${msg.type()}: ${msg.text()}`);
    });
    
    console.log('✅ Electron app launched successfully');
    
    return { app: this.app, page: this.page };
  }
  
  /**
   * Build the Electron app
   */
  private async buildApp(): Promise<void> {
    return new Promise((resolve, reject) => {
      const buildProcess = spawn('npm', ['run', 'build'], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'inherit'
      });
      
      buildProcess.on('exit', (code) => {
        if (code === 0) {
          console.log('✅ App built successfully');
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });
      
      buildProcess.on('error', (error) => {
        reject(new Error(`Build process error: ${error.message}`));
      });
    });
  }
  
  /**
   * Close the Electron application
   */
  async close(): Promise<void> {
    if (this.app) {
      await this.app.close();
      this.app = null;
      this.page = null;
      console.log('✅ Electron app closed');
    }
  }
  
  /**
   * Get the current page
   */
  getPage(): Page | null {
    return this.page;
  }
  
  /**
   * Get the Electron app instance
   */
  getApp(): ElectronApplication | null {
    return this.app;
  }
  
  /**
   * Wait for a specific element to be visible
   */
  async waitForElement(selector: string, timeout: number = 30000): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.waitForSelector(selector, { state: 'visible', timeout });
  }
  
  /**
   * Click an element
   */
  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.click(selector);
  }
  
  /**
   * Type text into an element
   */
  async type(selector: string, text: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.fill(selector, text);
  }
  
  /**
   * Get element text
   */
  async getText(selector: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');
    const element = await this.page.$(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    return await element.textContent() || '';
  }
  
  /**
   * Check if element exists
   */
  async exists(selector: string): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');
    const element = await this.page.$(selector);
    return element !== null;
  }
  
  /**
   * Take a screenshot
   */
  async screenshot(name: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.screenshot({ 
      path: path.join(__dirname, `../../screenshots/${name}.png`),
      fullPage: true 
    });
  }
}