import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import { PermissionManager } from './permissionManager';

export class PermissionIpcServer {
  private server: net.Server | null = null;
  private clients: Map<string, net.Socket> = new Map();
  private socketPath: string;

  constructor() {
    // Use a directory without spaces for better compatibility
    // DMG apps can write to user's home directory
    let socketDir: string;
    try {
      const homeDir = os.homedir();
      socketDir = path.join(homeDir, '.crystal', 'sockets');
      
      // Ensure the directory exists
      if (!fs.existsSync(socketDir)) {
        fs.mkdirSync(socketDir, { recursive: true });
      }
      
      // Test write access
      const testFile = path.join(socketDir, '.test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (error) {
      console.error('[Permission IPC] Failed to create socket directory, falling back to system temp:', error);
      socketDir = os.tmpdir();
    }
    
    this.socketPath = path.join(socketDir, `crystal-permissions-${process.pid}.sock`);
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Clean up any existing socket file
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
      }

      this.server = net.createServer((client) => {
        const clientId = `${Date.now()}-${Math.random()}`;
        this.clients.set(clientId, client);
        

        client.on('data', async (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'permission-request') {
              const { requestId, sessionId, toolName, input } = message;
              
              
              try {
                // Request permission from the frontend
                const response = await PermissionManager.getInstance().requestPermission(
                  sessionId,
                  toolName,
                  input
                );
                
                // Send response back to MCP bridge
                client.write(JSON.stringify({
                  type: 'permission-response',
                  requestId,
                  response
                }));
              } catch (error) {
                // Send error response
                client.write(JSON.stringify({
                  type: 'permission-response',
                  requestId,
                  response: {
                    behavior: 'deny',
                    message: error instanceof Error ? error.message : 'Permission denied'
                  }
                }));
              }
            }
          } catch (error) {
            console.error('[Permission IPC] Error handling message:', error);
          }
        });

        client.on('error', (error) => {
          console.error('[Permission IPC] Client error:', error);
        });

        client.on('close', () => {
          this.clients.delete(clientId);
        });
      });

      this.server.on('error', (error) => {
        console.error('[Permission IPC] Server error:', error);
        reject(error);
      });

      this.server.listen(this.socketPath, () => {
        
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all client connections
      for (const client of this.clients.values()) {
        client.end();
      }
      this.clients.clear();

      if (this.server) {
        this.server.close(() => {
          // Clean up socket file
          if (fs.existsSync(this.socketPath)) {
            fs.unlinkSync(this.socketPath);
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getSocketPath(): string {
    return this.socketPath;
  }
}