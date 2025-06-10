import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PermissionManager } from './permissionManager';

export class PermissionIpcServer {
  private server: net.Server | null = null;
  private clients: Map<string, net.Socket> = new Map();
  private socketPath: string;

  constructor() {
    // Use a unique socket path
    this.socketPath = path.join(os.tmpdir(), `crystal-permissions-${process.pid}.sock`);
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
        
        console.log('[Permission IPC] Client connected:', clientId);

        client.on('data', async (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'permission-request') {
              const { requestId, sessionId, toolName, input } = message;
              
              console.log('[Permission IPC] Received permission request:', {
                requestId,
                sessionId,
                toolName
              });
              
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
          console.log('[Permission IPC] Client disconnected:', clientId);
        });
      });

      this.server.on('error', (error) => {
        console.error('[Permission IPC] Server error:', error);
        reject(error);
      });

      this.server.listen(this.socketPath, () => {
        console.log('[Permission IPC] Server listening on:', this.socketPath);
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