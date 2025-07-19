const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Creating standalone MCP bridge script...');

// Create a wrapper script that includes all dependencies inline
const bridgeScript = `#!/usr/bin/env node
// This is a standalone MCP permission bridge script
// All dependencies are bundled inline to avoid ASAR issues

const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

const sessionId = process.argv[2];
const ipcPath = process.argv[3];

if (!sessionId || !ipcPath) {
  console.error('[MCP Bridge] ERROR: Missing required arguments');
  console.error('[MCP Bridge] Usage: node mcpPermissionBridge.js <sessionId> <ipcPath>');
  process.exit(1);
}

// Create IPC client to communicate with main process
let ipcClient = null;
let pendingRequests = new Map();

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
      console.error(\`[MCP Bridge] Error parsing IPC message: \${error}\`);
    }
  });
  
  ipcClient.on('error', (error) => {
    console.error(\`[MCP Bridge] IPC error: \${error}\`);
  });
  
  ipcClient.on('close', () => {
    process.exit(0);
  });
}

async function requestPermission(toolName, input) {
  return new Promise((resolve, reject) => {
    const requestId = \`\${Date.now()}-\${Math.random()}\`;
    
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

// Simple MCP server implementation
class SimpleMCPServer {
  constructor() {
    this.stdin = process.stdin;
    this.stdout = process.stdout;
    this.buffer = '';
    this.initialized = false;
  }

  async start() {
    // Connect to main process first
    connectToMainProcess();
    
    // Wait a bit for connection to establish
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Don't set raw mode - we need line-based input
    this.stdin.setEncoding('utf8');
    
    // Handle stdin data
    this.stdin.on('data', (chunk) => {
      this.buffer += chunk;
      this.processBuffer();
    });
  }
  
  processBuffer() {
    const lines = this.buffer.split('\\n');
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (e) {
          console.error(\`[MCP Bridge] Error parsing message: \${e}\`);
        }
      }
    }
  }
  
  async handleMessage(message) {
    
    // Handle initialize
    if (message.method === 'initialize' && !this.initialized) {
      this.initialized = true;
      this.sendMessage({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: message.params.protocolVersion || '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'crystal-permissions',
            version: '1.0.0'
          }
        }
      });
      
      // Send initialized notification
      this.sendMessage({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      });
    } else if (message.method === 'tools/list') {
      this.sendMessage({
        jsonrpc: '2.0',
        id: message.id,
        result: {
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
        }
      });
    } else if (message.method === 'tools/call') {
      if (message.params && message.params.name === 'approve_permission') {
        const args = message.params.arguments || {};
        
        try {
          // Request permission from the main process
          const response = await requestPermission(args.tool_name, args.input);
          
          // Return the expected format for permission prompt tool
          const permissionResult = {
            behavior: response.behavior,
            updatedInput: response.updatedInput || args.input,
            message: response.message || (response.behavior === 'allow' ? 'Permission granted' : 'Permission denied')
          };
          
          this.sendMessage({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify(permissionResult)
              }]
            }
          });
          
        } catch (error) {
          console.error(\`[MCP Bridge] Error handling tool call: \${error}\`);
          this.sendMessage({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32603,
              message: \`Internal error: \${error.message}\`
            }
          });
        }
      } else {
        this.sendMessage({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: \`Unknown tool: \${message.params?.name}\`
          }
        });
      }
    } else if (message.id) {
      // Unknown method with ID - send error
      this.sendMessage({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32601,
          message: 'Method not found'
        }
      });
    } else {
      // Notification or other message
    }
  }
  
  sendMessage(message) {
    const json = JSON.stringify(message);
    this.stdout.write(json + '\\n');
  }
}

// Start the server
const server = new SimpleMCPServer();
server.start().catch((error) => {
  console.error(\`[MCP Bridge] Failed to start: \${error}\`);
  console.error(\`[MCP Bridge] Stack trace: \${error.stack}\`);
  process.exit(1);
});

// Handle shutdown
process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});
`;

// Write the standalone script
const outputPath = path.join(__dirname, 'dist/main/src/services/mcpPermissionBridgeStandalone.js');
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
fs.writeFileSync(outputPath, bridgeScript);
fs.chmodSync(outputPath, 0o755);

console.log('Standalone MCP bridge script created at:', outputPath);

// Also keep the original compiled version
console.log('Original MCP bridge script preserved');