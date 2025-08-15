import WebSocket from 'ws';
import { EventEmitter } from 'events';
import * as net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class WebSocketServer extends EventEmitter {
  private static instance: WebSocketServer | null = null;
  private wss: WebSocket.Server | null = null;
  private clients: Set<WebSocket> = new Set();
  private messageQueue: Map<string, (response: any) => void> = new Map();
  private port: number | null = null;
  
  constructor() {
    super();
    // Singleton pattern to prevent multiple instances
    if (WebSocketServer.instance) {
      return WebSocketServer.instance;
    }
    WebSocketServer.instance = this;
  }
  
  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = net.createServer()
        .once('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            resolve(true);
          } else {
            resolve(false);
          }
        })
        .once('listening', () => {
          tester.close(() => resolve(false));
        })
        .listen(port);
    });
  }
  
  private async killProcessOnPort(port: number): Promise<void> {
    try {
      // Try to find and kill process on the port
      if (process.platform === 'darwin' || process.platform === 'linux') {
        // On macOS and Linux, find the process using lsof
        const { stdout } = await execAsync(`lsof -ti:${port}`);
        const pids = stdout.trim().split('\n').filter(Boolean);
        
        if (pids.length > 0) {
          // Kill the processes
          for (const pid of pids) {
            try {
              await execAsync(`kill -9 ${pid}`);
              console.log(`Killed process ${pid} on port ${port}`);
            } catch (e) {
              console.warn(`Failed to kill process ${pid}:`, e);
            }
          }
          // Wait a bit for the port to be released
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } else if (process.platform === 'win32') {
        // On Windows, use netstat and taskkill
        try {
          const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
          const lines = stdout.trim().split('\n');
          const pids = new Set<string>();
          
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0') {
              pids.add(pid);
            }
          }
          
          for (const pid of pids) {
            try {
              await execAsync(`taskkill /F /PID ${pid}`);
              console.log(`Killed process ${pid} on port ${port}`);
            } catch (e) {
              console.warn(`Failed to kill process ${pid}:`, e);
            }
          }
          // Wait a bit for the port to be released
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          // No process found on port
        }
      }
    } catch (error) {
      // If lsof/netstat fails, it might mean no process is using the port
      console.log(`No process found on port ${port} or unable to kill it`);
    }
  }

  async start(port: number): Promise<boolean> {
    // If already running on the same port, return success
    if (this.wss && this.port === port) {
      console.log(`WebSocket server already running on port ${port}`);
      return true;
    }
    
    // Close existing server if running on different port
    if (this.wss) {
      await this.stop();
    }
    
    // Check if port is in use
    const portInUse = await this.isPortInUse(port);
    if (portInUse) {
      console.log(`Port ${port} is already in use. Attempting to free it...`);
      
      // Try to kill the process on the port
      await this.killProcessOnPort(port);
      
      // Check again if port is free now
      const stillInUse = await this.isPortInUse(port);
      if (stillInUse) {
        console.error(`Port ${port} is still in use after cleanup attempt`);
        return false;
      }
      
      console.log(`Port ${port} successfully freed`);
    }
    
    return new Promise((resolve) => {
      try {
        this.wss = new WebSocket.Server({ port }, () => {
          // Server started successfully
          this.port = port;
          console.log(`WebSocket server listening on port ${port}`);
          resolve(true);
        });
        
        this.wss.on('connection', (ws) => {
          console.log('Python backend connected');
          this.clients.add(ws);
          
          ws.on('message', (data) => {
            try {
              const message = JSON.parse(data.toString());
              this.handleMessage(message);
            } catch (error) {
              console.error('Failed to parse WebSocket message:', error);
            }
          });
          
          ws.on('close', () => {
            console.log('Python backend disconnected');
            this.clients.delete(ws);
          });
          
          ws.on('error', (error) => {
            console.error('WebSocket client error:', error);
          });
        });
        
        this.wss.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use.`);
            this.wss = null;
            this.port = null;
            resolve(false);
          } else {
            console.error('WebSocket server error:', error);
            this.wss = null;
            this.port = null;
            resolve(false);
          }
        });
      } catch (error) {
        console.error('Failed to start WebSocket server:', error);
        resolve(false);
      }
    });
  }
  
  private handleMessage(message: any) {
    if (message.type === 'response' && message.id) {
      const callback = this.messageQueue.get(message.id);
      if (callback) {
        callback(message.payload);
        this.messageQueue.delete(message.id);
      }
    } else if (message.type === 'event') {
      this.emit(message.action, message.payload);
    }
  }
  
  async sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Date.now().toString() + Math.random().toString(36);
      const fullMessage = { ...message, id, timestamp: Date.now() };
      
      const client = Array.from(this.clients)[0];
      if (!client || client.readyState !== WebSocket.OPEN) {
        reject(new Error('No connected Python backend'));
        return;
      }
      
      this.messageQueue.set(id, resolve);
      client.send(JSON.stringify(fullMessage));
      
      // Longer timeout for MCP operations
      const timeoutDuration = 
        message.action?.includes('mcp') || 
        message.action?.includes('intelligent') ||
        message.action === 'run_intelligent_task'
          ? 120000  // 2 minutes for MCP operations
          : 30000;  // 30 seconds for other operations
      
      setTimeout(() => {
        if (this.messageQueue.has(id)) {
          this.messageQueue.delete(id);
          reject(new Error('Request timeout'));
        }
      }, timeoutDuration);
    });
  }
  
  broadcast(message: any) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
  
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        // Close all client connections first
        this.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.close();
          }
        });
        this.clients.clear();
        
        // Close the server
        this.wss.close((err) => {
          if (err) {
            console.error('Error closing WebSocket server:', err);
          }
          this.wss = null;
          this.port = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}