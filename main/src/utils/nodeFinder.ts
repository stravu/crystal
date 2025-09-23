import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { findExecutableInPath } from './shellPath';
import { app } from 'electron';

/**
 * Find the Node.js executable, trying multiple strategies
 * This is crucial for macOS GUI apps that don't inherit PATH properly
 */
export async function findNodeExecutable(): Promise<string> {
  // First, try to find node in PATH
  const nodeInPath = findExecutableInPath('node');
  if (nodeInPath) {
    console.log(`[NodeFinder] Found node in PATH: ${nodeInPath}`);
    return nodeInPath;
  }

  console.log('[NodeFinder] Node not found in PATH, trying common locations...');

  // Common node installation paths on different platforms
  const platform = os.platform();
  const commonNodePaths: string[] = [];

  if (platform === 'darwin') {
    // macOS paths
    commonNodePaths.push(
      '/usr/local/bin/node',
      '/opt/homebrew/bin/node',
      '/opt/homebrew/opt/node/bin/node',
      '/usr/bin/node',
      path.join(os.homedir(), '.nvm/versions/node/*/bin/node'), // nvm
      path.join(os.homedir(), '.volta/bin/node'), // volta
      path.join(os.homedir(), '.asdf/shims/node'), // asdf
      '/opt/local/bin/node', // MacPorts
      '/sw/bin/node' // Fink
    );
  } else if (platform === 'linux') {
    // Linux paths
    commonNodePaths.push(
      '/usr/bin/node',
      '/usr/local/bin/node',
      '/snap/bin/node',
      path.join(os.homedir(), '.nvm/versions/node/*/bin/node'),
      path.join(os.homedir(), '.volta/bin/node'),
      path.join(os.homedir(), '.asdf/shims/node'),
      path.join(os.homedir(), '.local/bin/node'),
      '/opt/node/bin/node'
    );
  } else if (platform === 'win32') {
    // Windows paths
    commonNodePaths.push(
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(os.homedir(), 'AppData\\Roaming\\npm\\node.exe'),
      path.join(os.homedir(), 'scoop\\apps\\nodejs\\current\\node.exe'),
      path.join(os.homedir(), '.volta\\bin\\node.exe')
    );

    // Check nvm-windows
    const nvmHome = process.env.NVM_HOME;
    if (nvmHome) {
      commonNodePaths.push(path.join(nvmHome, 'node.exe'));
    }
  }

  // Check each path
  for (const nodePath of commonNodePaths) {
    // Handle glob patterns (like nvm paths)
    if (nodePath.includes('*')) {
      const baseDir = path.dirname(nodePath.split('*')[0]);
      if (fs.existsSync(baseDir)) {
        try {
          const pattern = path.basename(nodePath);
          const entries = fs.readdirSync(baseDir);
          for (const entry of entries) {
            const fullPath = path.join(baseDir, entry, 'bin', 'node');
            if (fs.existsSync(fullPath)) {
              console.log(`[NodeFinder] Found node at: ${fullPath}`);
              return fullPath;
            }
          }
        } catch (e) {
          // Ignore errors reading directories
        }
      }
    } else if (fs.existsSync(nodePath)) {
      try {
        // Verify it's executable
        fs.accessSync(nodePath, fs.constants.X_OK);
        console.log(`[NodeFinder] Found node at: ${nodePath}`);
        return nodePath;
      } catch {
        // Not executable, continue searching
      }
    }
  }

  // If still not found and we're in a packaged app, use Electron's node
  if (app.isPackaged) {
    console.log('[NodeFinder] Using Electron\'s built-in Node.js');
    return process.execPath;
  }

  // Final attempt: try which/where command
  try {
    const whichCommand = platform === 'win32' ? 'where' : 'which';
    const nodePath = execSync(`${whichCommand} node`, { encoding: 'utf8' }).trim().split('\n')[0];
    if (nodePath && fs.existsSync(nodePath)) {
      console.log(`[NodeFinder] Found node using ${whichCommand}: ${nodePath}`);
      return nodePath;
    }
  } catch {
    // which/where failed
  }

  // If all else fails, return 'node' and hope it's in the PATH when we execute
  console.warn('[NodeFinder] Could not find node executable, falling back to "node"');
  return 'node';
}

/**
 * Test if a Node.js executable actually works
 */
export async function testNodeExecutable(nodePath: string): Promise<boolean> {
  try {
    execSync(`"${nodePath}" --version`, { encoding: 'utf8', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a CLI tool's Node.js script file (for direct Node.js invocation fallback)
 * This is a generic function that works for any npm-installed CLI tool
 * @param cliExecutablePath Path to the CLI executable/command
 * @returns Path to the actual JavaScript file, or null if not found
 */
export function findCliNodeScript(cliExecutablePath: string): string | null {
  try {
    // Read the executable to check if it's a script
    const content = fs.readFileSync(cliExecutablePath, 'utf8');
    
    // Check if it starts with a shebang
    if (content.startsWith('#!')) {
      // This is likely the script itself
      return cliExecutablePath;
    }

    // Get the command name from the path (e.g., 'claude', 'codex', 'aider')
    const commandName = path.basename(cliExecutablePath).replace(/\.(exe|cmd|bat)$/i, '');
    
    // Check common locations relative to the executable for npm-installed tools
    const possibleScriptPaths = [
      cliExecutablePath, // The executable itself might be the script
      path.join(path.dirname(cliExecutablePath), `${commandName}.js`),
      // Common npm global install patterns
      path.join(path.dirname(cliExecutablePath), '../lib/node_modules', commandName, 'dist/index.js'),
      path.join(path.dirname(cliExecutablePath), '../lib/node_modules', commandName, 'index.js'),
      path.join(path.dirname(cliExecutablePath), '../lib/node_modules', commandName, 'lib/index.js'),
      path.join(path.dirname(cliExecutablePath), '../lib/node_modules', commandName, 'bin', `${commandName}.js`),
      // Specific patterns for known tools
      path.join(path.dirname(cliExecutablePath), '../lib/node_modules/@anthropic-ai/claude-code/dist/index.js'),
      path.join(path.dirname(cliExecutablePath), '../lib/node_modules/@openai/codex/dist/index.js'),
    ];

    for (const scriptPath of possibleScriptPaths) {
      if (fs.existsSync(scriptPath)) {
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
        // Check if it looks like a Node.js script
        if (scriptContent.includes('require') || scriptContent.includes('import') || scriptContent.includes('#!/usr/bin/env')) {
          console.log(`[NodeFinder] Found CLI script at: ${scriptPath}`);
          return scriptPath;
        }
      }
    }
  } catch (e) {
    console.error('[NodeFinder] Error finding CLI script:', e);
  }

  return null;
}

/**
 * @deprecated Use findCliNodeScript instead
 * Kept for backward compatibility
 */
export const findClaudeCodeScript = findCliNodeScript;