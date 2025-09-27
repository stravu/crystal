#!/usr/bin/env node

// This is the MCP permission bridge that runs as a subprocess
// It communicates with the main Crystal process via IPC

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { PermissionResponse } from './permissionManager';

const sessionId = process.argv[2];
const ipcPath = process.argv[3];


if (!sessionId || !ipcPath) {
  console.error('[MCP Bridge] ERROR: Missing required arguments');
  console.error('[MCP Bridge] Usage: node mcpPermissionBridge.js <sessionId> <ipcPath>');
  process.exit(1);
}

// Create IPC client to communicate with main process
let ipcClient: net.Socket | null = null;
let pendingRequests = new Map<string, (response: PermissionResponse) => void>();

function connectToMainProcess() {
  ipcClient = net.createConnection(ipcPath);
  
  ipcClient.on('connect', () => {
    // Connected successfully
  });
  
  ipcClient.on('data', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'permission-response' && message.requestId) {
        const resolver = pendingRequests.get(message.requestId);
        if (resolver) {
          resolver(message.response);
          pendingRequests.delete(message.requestId);
        }
      }
    } catch (error) {
      console.error(`[MCP Bridge] Error parsing IPC message: ${error}`);
    }
  });
  
  ipcClient.on('error', (error) => {
    console.error(`[MCP Bridge] IPC error: ${error}`);
  });
  
  ipcClient.on('close', () => {
    process.exit(0);
  });
}

async function requestPermission(toolName: string, input: Record<string, unknown>): Promise<PermissionResponse> {
  return new Promise((resolve, reject) => {
    const requestId = `${Date.now()}-${Math.random()}`;
    
    pendingRequests.set(requestId, (response) => {
      resolve(response);
    });
    
    if (ipcClient && !ipcClient.destroyed) {
      ipcClient.write(JSON.stringify({
        type: 'permission-request',
        requestId,
        sessionId,
        toolName,
        input
      }));
    } else {
      pendingRequests.delete(requestId);
      reject(new Error('IPC client not connected'));
    }
  });
}

async function main() {
  // Connect to main process first
  connectToMainProcess();
  
  // Wait a bit for connection to establish
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const server = new Server({
    name: 'crystal-permissions',
    version: '1.0.0'
  }, {
    capabilities: {
      tools: {}
    }
  });

  const transport = new StdioServerTransport();

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [{
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
    }];
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'approve_permission') {
      const { tool_name, input } = request.params.arguments as { tool_name: string; input: Record<string, unknown> };
      
      try {
        const response = await requestPermission(tool_name, input);
        
        // Return the expected format for permission prompt tool
        // The response should have behavior and optionally updatedInput
        const permissionResult = {
          behavior: response.behavior,
          updatedInput: response.updatedInput || input,
          message: response.message
        };
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(permissionResult)
          }]
        };
      } catch (error) {
        console.error(`[MCP Bridge] Permission request error: ${error}`);
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

  // Connect and run
  await server.connect(transport);
}

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  if (ipcClient) {
    ipcClient.end();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  if (ipcClient) {
    ipcClient.end();
  }
  process.exit(0);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(`[MCP Bridge] Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

process.on('uncaughtException', (error) => {
  console.error(`[MCP Bridge] Uncaught Exception: ${error}`);
  console.error(`[MCP Bridge] Stack trace: ${error.stack}`);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error(`[MCP Bridge] Failed to start: ${error}`);
  console.error(`[MCP Bridge] Stack trace: ${error.stack}`);
  process.exit(1);
});