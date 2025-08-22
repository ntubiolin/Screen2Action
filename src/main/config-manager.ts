import { app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export class ConfigManager {
  private isProduction = !process.env.NODE_ENV || process.env.NODE_ENV === 'production';
  private configFilePath: string;
  private envFilePath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configFilePath = path.join(userDataPath, 'config.json');
    this.envFilePath = path.join(this.getBackendPath(), '.env');
  }

  /**
   * Get the app configuration schema
   */
  async getAppConfig(): Promise<any> {
    try {
      const configPath = this.isProduction 
        ? path.join(process.resourcesPath, 'resources', 'app-config.json')
        : path.join(app.getAppPath(), 'resources', 'app-config.json');
      
      if (!fs.existsSync(configPath)) {
        throw new Error('App configuration file not found');
      }

      const configData = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(configData);
    } catch (error) {
      console.error('Failed to load app config:', error);
      throw error;
    }
  }

  /**
   * Get current configuration values
   */
  async getConfigValues(): Promise<Record<string, string>> {
    const values: Record<string, string> = {};

    // Load from user config file
    if (fs.existsSync(this.configFilePath)) {
      try {
        const configData = fs.readFileSync(this.configFilePath, 'utf-8');
        const userConfig = JSON.parse(configData);
        Object.assign(values, userConfig);
      } catch (error) {
        console.error('Failed to load user config:', error);
      }
    }

    // Load from .env file
    if (fs.existsSync(this.envFilePath)) {
      try {
        const envData = fs.readFileSync(this.envFilePath, 'utf-8');
        const envVars = this.parseEnvFile(envData);
        Object.assign(values, envVars);
      } catch (error) {
        console.error('Failed to load .env file:', error);
      }
    }

    // Load from environment variables
    const appConfig = await this.getAppConfig();
    for (const field of appConfig.configuration.configurable_keys) {
      if (process.env[field.key]) {
        values[field.key] = process.env[field.key] || '';
      }
    }

    return values;
  }

  /**
   * Save configuration values
   */
  async saveConfigValues(values: Record<string, string>): Promise<void> {
    try {
      // Save to user config file
      const userDataDir = path.dirname(this.configFilePath);
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }
      
      fs.writeFileSync(this.configFilePath, JSON.stringify(values, null, 2));

      // Update .env file
      await this.updateEnvFile(values);

      console.log('Configuration saved successfully');
    } catch (error) {
      console.error('Failed to save configuration:', error);
      throw error;
    }
  }

  /**
   * Update .env file with new values
   */
  private async updateEnvFile(values: Record<string, string>): Promise<void> {
    try {
      const backendDir = this.getBackendPath();
      if (!fs.existsSync(backendDir)) {
        fs.mkdirSync(backendDir, { recursive: true });
      }

      let envContent = '';
      
      // Read existing .env file if it exists
      if (fs.existsSync(this.envFilePath)) {
        envContent = fs.readFileSync(this.envFilePath, 'utf-8');
      } else {
        // Copy from .env.example if it exists
        const examplePath = path.join(backendDir, '.env.example');
        if (fs.existsSync(examplePath)) {
          envContent = fs.readFileSync(examplePath, 'utf-8');
        }
      }

      // Update or add values
      const lines = envContent.split('\n');
      const updatedLines: string[] = [];
      const processedKeys = new Set<string>();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed === '') {
          updatedLines.push(line);
          continue;
        }

        const [key] = trimmed.split('=', 1);
        if (key && values.hasOwnProperty(key)) {
          updatedLines.push(`${key}=${values[key] || ''}`);
          processedKeys.add(key);
        } else {
          updatedLines.push(line);
        }
      }

      // Add any new values that weren't in the original file
      for (const [key, value] of Object.entries(values)) {
        if (!processedKeys.has(key) && value) {
          updatedLines.push(`${key}=${value}`);
        }
      }

      fs.writeFileSync(this.envFilePath, updatedLines.join('\n'));
    } catch (error) {
      console.error('Failed to update .env file:', error);
      throw error;
    }
  }

  /**
   * Parse .env file content
   */
  private parseEnvFile(content: string): Record<string, string> {
    const values: Record<string, string> = {};
    
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '' || !trimmed.includes('=')) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        values[key] = valueParts.join('=');
      }
    }

    return values;
  }

  /**
   * Show directory selection dialog
   */
  async selectDirectory(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Directory'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  }

  /**
   * Get the path to the backend directory
   */
  private getBackendPath(): string {
    if (this.isProduction) {
      return path.join(process.resourcesPath, 'backend');
    } else {
      return path.join(app.getAppPath(), 'backend');
    }
  }

  /**
   * Get application info for display
   */
  async getAppInfo(): Promise<{ name: string; version: string; dataPath: string }> {
    return {
      name: app.getName(),
      version: app.getVersion(),
      dataPath: app.getPath('userData')
    };
  }
}