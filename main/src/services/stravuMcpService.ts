import { EventEmitter } from 'events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import type { ConfigManager } from './configManager';

export interface StravuFile {
  id: string;
  name: string;
  path: string;
  content?: string;
  type: string;
  size: number;
  modified: string;
}

export interface StravuSearchResult {
  files: StravuFile[];
  totalCount: number;
}

export class StravuMcpService extends EventEmitter {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private configManager: ConfigManager;
  private isConnected = false;

  constructor(configManager: ConfigManager) {
    super();
    this.configManager = configManager;
  }

  async connect(): Promise<boolean> {
    try {
      // Always fail to connect - MCP functionality disabled
      throw new Error('Functionality coming soon');
    } catch (error) {
      console.error('[StravuMcpService] Connection failed:', error);
      this.emit('error', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        console.error('[StravuMcpService] Error closing transport:', error);
      }
    }

    this.client = null;
    this.transport = null;
    this.isConnected = false;
    this.emit('disconnected');
  }

  async testConnection(): Promise<boolean> {
    try {
      // Always fail connection test - MCP functionality disabled
      return false;
    } catch (error) {
      console.error('[StravuMcpService] Connection test failed:', error);
      return false;
    }
  }

  async searchFiles(query: string, limit = 20): Promise<StravuSearchResult> {
    if (!this.isConnected) {
      throw new Error('Not connected to Stravu MCP server');
    }

    try {
      // For now, return mock data
      // In a real implementation, this would use the MCP client to search files
      const mockFiles: StravuFile[] = [
        {
          id: '1',
          name: 'project-spec.md',
          path: '/docs/project-spec.md',
          type: 'markdown',
          size: 2048,
          modified: new Date().toISOString(),
          content: undefined
        },
        {
          id: '2',
          name: 'api-reference.md',
          path: '/docs/api-reference.md',
          type: 'markdown',
          size: 4096,
          modified: new Date().toISOString(),
          content: undefined
        }
      ].filter(file => 
        file.name.toLowerCase().includes(query.toLowerCase()) ||
        file.path.toLowerCase().includes(query.toLowerCase())
      );

      return {
        files: mockFiles.slice(0, limit),
        totalCount: mockFiles.length
      };
    } catch (error) {
      console.error('[StravuMcpService] Search failed:', error);
      throw error;
    }
  }

  async getFileContent(fileId: string): Promise<string> {
    if (!this.isConnected) {
      throw new Error('Not connected to Stravu MCP server');
    }

    try {
      // For now, return mock content
      // In a real implementation, this would use the MCP client to fetch file content
      return `# Mock File Content for ${fileId}

This is mock content for demonstration purposes.
In a real implementation, this would be fetched from Stravu.

## Features
- File retrieval
- Content formatting
- Integration with Claude Code

## Usage
This content would be injected into Claude Code prompts.`;
    } catch (error) {
      console.error('[StravuMcpService] Failed to get file content:', error);
      throw error;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}