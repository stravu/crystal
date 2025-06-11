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

// Write debug logs to a file for debugging
const logDir = path.join(os.homedir(), '.crystal-mcp');
const logFile = path.join(logDir, \`bridge-\${sessionId}.log\`);

// Ensure log directory exists
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (e) {
  // Ignore errors creating log directory
}

const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = \`\${timestamp} \${message}\\n\`;
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (e) {
    // Ignore file write errors
  }
  console.error(\`[MCP Bridge] \${message}\`);
};

log(\`Starting with args: \${process.argv.join(' ')}\`);
log(\`Session ID: \${sessionId}\`);
log(\`IPC Path: \${ipcPath}\`);
log(\`Process PID: \${process.pid}\`);
log(\`Node version: \${process.version}\`);

if (!sessionId || !ipcPath) {
  log('ERROR: Missing required arguments');
  log('Usage: node mcpPermissionBridge.js <sessionId> <ipcPath>');
  process.exit(1);
}

// Create IPC client to communicate with main process
let ipcClient = null;
let pendingRequests = new Map();

function connectToMainProcess() {
  log(\`Attempting to connect to IPC socket: \${ipcPath}\`);
  
  ipcClient = net.createConnection(ipcPath);
  
  ipcClient.on('connect', () => {
    log(\`Connected to main process for session \${sessionId}\`);
  });
  
  ipcClient.on('data', (data) => {
    try {
      const message = JSON.parse(data.toString());
      log(\`Received IPC message: \${JSON.stringify(message)}\`);
      
      if (message.type === 'permission-response' && message.requestId) {
        const resolver = pendingRequests.get(message.requestId);
        if (resolver) {
          resolver(message.response);
          pendingRequests.delete(message.requestId);
        }
      }
    } catch (error) {
      log(\`Error parsing IPC message: \${error}\`);
    }
  });
  
  ipcClient.on('error', (error) => {
    log(\`IPC error: \${error}\`);
  });
  
  ipcClient.on('close', () => {
    log('IPC connection closed');
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
      
      log(\`Sent permission request to main process: \${requestId}\`);
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
    log('Starting simplified MCP server...');
    
    // Connect to main process first
    connectToMainProcess();
    
    // Wait a bit for connection to establish
    log('Waiting for IPC connection to establish...');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Don't set raw mode - we need line-based input
    this.stdin.setEncoding('utf8');
    
    // Handle stdin data
    this.stdin.on('data', (chunk) => {
      this.buffer += chunk;
      this.processBuffer();
    });
    
    // Don't send anything until we receive initialize
    log('MCP server started, waiting for initialize...');
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
          log(\`Error parsing message: \${e}\`);
        }
      }
    }
  }
  
  async handleMessage(message) {
    log(\`Received message: \${JSON.stringify(message)}\`);
    
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
      log(\`Tool call request for: \${message.params?.name}\`);
      
      if (message.params && message.params.name === 'approve_permission') {
        const args = message.params.arguments || {};
        log(\`Tool arguments: \${JSON.stringify(args)}\`);
        
        try {
          log(\`Requesting permission for tool: \${args.tool_name}\`);
          
          // Request permission from the main process
          const response = await requestPermission(args.tool_name, args.input);
          log(\`Permission response: \${JSON.stringify(response)}\`);
          
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
          
          log(\`Sent permission response: \${JSON.stringify(permissionResult)}\`);
        } catch (error) {
          log(\`Error handling tool call: \${error}\`);
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
        log(\`Unknown tool: \${message.params?.name}\`);
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
      log(\`Unknown method with ID: \${message.method}\`);
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
      log(\`Unhandled message: \${JSON.stringify(message)}\`);
    }
  }
  
  sendMessage(message) {
    const json = JSON.stringify(message);
    this.stdout.write(json + '\\n');
    log(\`Sent message: \${json}\`);
  }
}

// Start the server
const server = new SimpleMCPServer();
server.start().catch((error) => {
  log(\`Failed to start: \${error}\`);
  log(\`Stack trace: \${error.stack}\`);
  process.exit(1);
});

// Handle shutdown
process.on('SIGTERM', () => {
  log('Received SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Received SIGINT');
  process.exit(0);
});
`;

// Write the standalone script
const outputPath = path.join(__dirname, 'dist/services/mcpPermissionBridgeStandalone.js');
fs.writeFileSync(outputPath, bridgeScript);
fs.chmodSync(outputPath, 0o755);

console.log('Standalone MCP bridge script created at:', outputPath);

// Also keep the original compiled version
console.log('Original MCP bridge script preserved');