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

const sessionId = process.argv[2];
const ipcPath = process.argv[3];

// Write debug logs to a file for debugging
const logDir = path.join(os.homedir(), '.crystal-mcp');
const logFile = path.join(logDir, `bridge-${sessionId}.log`);

// Ensure log directory exists
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (e) {
  // Ignore errors creating log directory
}

const log = (message: string) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} ${message}\n`;
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (e) {
    // Ignore file write errors
  }
  console.error(`[MCP Bridge] ${message}`);
};

log(`Starting with args: ${process.argv.join(' ')}`);
log(`Session ID: ${sessionId}`);
log(`IPC Path: ${ipcPath}`);
log(`Process PID: ${process.pid}`);
log(`Node version: ${process.version}`);

if (!sessionId || !ipcPath) {
  log('ERROR: Missing required arguments');
  log('Usage: node mcpPermissionBridge.js <sessionId> <ipcPath>');
  process.exit(1);
}

// Create IPC client to communicate with main process
let ipcClient: net.Socket | null = null;
let pendingRequests = new Map<string, (response: any) => void>();

function connectToMainProcess() {
  log(`Attempting to connect to IPC socket: ${ipcPath}`);
  ipcClient = net.createConnection(ipcPath);
  
  ipcClient.on('connect', () => {
    log(`Connected to main process for session ${sessionId}`);
  });
  
  ipcClient.on('data', (data) => {
    try {
      const message = JSON.parse(data.toString());
      log(`Received IPC message: ${JSON.stringify(message)}`);
      if (message.type === 'permission-response' && message.requestId) {
        const resolver = pendingRequests.get(message.requestId);
        if (resolver) {
          resolver(message.response);
          pendingRequests.delete(message.requestId);
        }
      }
    } catch (error) {
      log(`Error parsing IPC message: ${error}`);
    }
  });
  
  ipcClient.on('error', (error) => {
    log(`IPC error: ${error}`);
  });
  
  ipcClient.on('close', () => {
    log('IPC connection closed');
    process.exit(0);
  });
}

async function requestPermission(toolName: string, input: any): Promise<any> {
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
  log('Starting main function');
  
  // Connect to main process first
  connectToMainProcess();
  
  // Wait a bit for connection to establish
  log('Waiting for IPC connection to establish...');
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
    log('Received ListTools request');
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
    log(`Returning ${tools.length} tools`);
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'approve_permission') {
      const { tool_name, input } = request.params.arguments as { tool_name: string; input: any };
      
      try {
        log(`Requesting permission for tool: ${tool_name}`);
        const response = await requestPermission(tool_name, input);
        log(`Permission response: ${JSON.stringify(response)}`);
        
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
        log(`Permission request error: ${error}`);
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
  log('Connecting server to transport...');
  await server.connect(transport);
  log(`MCP permission server started successfully for session ${sessionId}`);
  log('Ready to handle permission requests');
}

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  log('Received SIGTERM signal');
  if (ipcClient) {
    ipcClient.end();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Received SIGINT signal');
  if (ipcClient) {
    ipcClient.end();
  }
  process.exit(0);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error}`);
  log(`Stack trace: ${error.stack}`);
  process.exit(1);
});

// Start the server
log('Process started, calling main()');
main().catch((error) => {
  log(`Failed to start: ${error}`);
  log(`Stack trace: ${error.stack}`);
  process.exit(1);
});