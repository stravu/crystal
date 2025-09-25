import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { PermissionManager } from './permissionManager';
import { z } from 'zod';

export class MCPPermissionServer {
  private server: Server;
  private transport: StdioServerTransport;
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.server = new Server({
      name: 'crystal-permissions',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });

    this.transport = new StdioServerTransport();
    this.setupTools();
  }

  private setupTools() {
    const permissionManager = PermissionManager.getInstance();

    // Define the permission approval tool
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [{
          name: 'approve_permission',
          description: 'Request permission to use a tool',
          inputSchema: {
            type: 'object',
            properties: {
              tool_name: {
                type: 'string',
                description: 'The tool requesting permission'
              },
              input: {
                type: 'object',
                description: 'The input for the tool'
              }
            },
            required: ['tool_name', 'input']
          }
        }]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'approve_permission') {
        const { tool_name, input } = request.params.arguments as { tool_name: string; input: Record<string, unknown> };
        
        try {
          const response = await permissionManager.requestPermission(
            this.sessionId,
            tool_name,
            input
          );

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(response)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                behavior: 'deny',
                message: error instanceof Error ? error.message : 'Permission denied'
              })
            }]
          };
        }
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }

  async start() {
    await this.server.connect(this.transport);
  }

  async stop() {
    await this.server.close();
  }
}