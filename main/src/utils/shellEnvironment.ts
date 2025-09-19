import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { ShellDetector } from './shellDetector';

/**
 * Load complete user environment from shell configuration files
 *
 * This function is critical for third-party LLM provider support in Crystal.
 * It sources the user's shell configuration files (.zprofile, .bashrc, .profile, etc.)
 * to load environment variables like ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN
 * that are required for services like z.ai to authenticate with Claude Code.
 *
 * The function handles multiple scenarios:
 * - Windows: Uses current process environment with Windows-specific variables
 * - Unix/macOS development: Uses fast non-interactive shell mode
 * - Packaged app: Sources shell config files explicitly to get complete environment
 * - Fallback: Returns current process environment if shell loading fails
 *
 * @returns {Object} Complete environment variables from user's shell
 *
 * @example
 * // Load environment for third-party LLM provider
 * const env = getShellEnvironment();
 * if (env.ANTHROPIC_BASE_URL && env.ANTHROPIC_AUTH_TOKEN) {
 *   // Can authenticate with third-party provider
 * }
 */
export function getShellEnvironment(): { [key: string]: string } {
  try {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // On Windows, we'll use the current process environment plus some key Windows-specific variables
      // Windows doesn't have the same concept of shell environment loading as Unix
      return {
        ...process.env,
        // Ensure these Windows-specific variables are available
        APPDATA: process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
        LOCALAPPDATA: process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
        USERPROFILE: process.env.USERPROFILE || os.homedir(),
      };
    }

    // Unix/macOS logic - get the complete environment from the user's shell
    const shellInfo = ShellDetector.getDefaultShell();
    const shell = shellInfo.path;
    const isLinux = process.platform === 'linux';

    // For Linux, use a more efficient approach (non-interactive shell)
    // For macOS, use login shell to get full environment including .zprofile/.bash_profile
    const envCommand = isLinux
      ? `${shell} -c 'env'`  // Fast non-interactive mode for Linux
      : `${shell} -l -i -c 'env'`;  // Login shell for macOS to get full environment

    // Check if we're running in a packaged Electron app
    // Packaged apps need to explicitly source shell config files to get user environment
    const isPackaged = process.env.NODE_ENV === 'production' || (process as any).pkg;

    let envOutput: string;

    if (isPackaged) {
      // In packaged app, we must explicitly source shell config files
      // to get the user's complete environment including third-party LLM credentials
      const homeDir = os.homedir();

      // Build command to source shell config files in proper order
      // This ensures we load environment variables from the same files as an interactive shell
      let sourceCommand = '';

      if (shell.includes('zsh')) {
        // Zsh sources files in this order: /etc/zprofile, ~/.zprofile, /etc/zshrc, ~/.zshrc
        sourceCommand = `source /etc/zprofile 2>/dev/null || true; ` +
                       `source ${homeDir}/.zprofile 2>/dev/null || true; ` +
                       `source /etc/zshrc 2>/dev/null || true; ` +
                       `source ${homeDir}/.zshrc 2>/dev/null || true; `;
      } else if (shell.includes('bash')) {
        // Bash sources files in this order: /etc/profile, ~/.bash_profile, ~/.bashrc, ~/.profile
        sourceCommand = `source /etc/profile 2>/dev/null || true; ` +
                       `source ${homeDir}/.bash_profile 2>/dev/null || true; ` +
                       `source ${homeDir}/.bashrc 2>/dev/null || true; ` +
                       `source ${homeDir}/.profile 2>/dev/null || true; `;
      }

      // Some zsh users put environment variables in .zprofile instead of .zshrc
      // Ensure we check both for completeness
      if (shell.includes('zsh')) {
        sourceCommand += `source ${homeDir}/.zprofile 2>/dev/null || true; `;
      }

      const fullCommand = `${shell} -c '${sourceCommand}env'`;

      // Use minimal base PATH to find the shell and avoid recursion issues
      const minimalPath = '/usr/bin:/bin';

      // Execute shell command with timeout and minimal environment
      // Timeout is shorter for Linux (typically faster) than macOS
      envOutput = execSync(fullCommand, {
        encoding: 'utf8',
        timeout: isLinux ? 5000 : 15000,
        env: {
          PATH: minimalPath,
          SHELL: shell,
          USER: os.userInfo().username,
          HOME: homeDir,
          ZDOTDIR: process.env.ZDOTDIR || homeDir
        }
      }).trim();
    } else {
      // In development mode, try fast non-interactive shell first
      // Fall back to login shell if fast approach fails
      try {
        envOutput = execSync(`${shell} -c 'env'`, {
          encoding: 'utf8',
          timeout: 3000,
          env: process.env
        }).trim();
      } catch (quickError) {
        // Fast approach failed, use full login shell
        envOutput = execSync(envCommand, {
          encoding: 'utf8',
          timeout: isLinux ? 5000 : 15000,
          env: process.env
        }).trim();
      }
    }

    // Parse the environment output into key-value pairs
    // Format: KEY=value, one per line
    const envVars: { [key: string]: string } = {};
    const lines = envOutput.split('\n');

    for (const line of lines) {
      const equalIndex = line.indexOf('=');
      if (equalIndex > 0) {
        const key = line.substring(0, equalIndex);
        const value = line.substring(equalIndex + 1);
        envVars[key] = value;
      }
    }

    return envVars;

  } catch (error) {
    // Fallback to current process environment if shell loading fails
    // This ensures Crystal continues to work even if shell environment loading fails
    // Filter out undefined values to maintain consistent string-only environment
    const fallbackEnv: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        fallbackEnv[key] = value;
      }
    }
    return fallbackEnv;
  }
}

/**
 * Get merged environment combining shell environment with Crystal-specific variables
 *
 * This function is the main entry point used by AbstractCliManager to get the
 * complete environment that should be passed to Claude Code processes. It combines:
 * 1. Complete user shell environment (including third-party LLM credentials)
 * 2. Enhanced PATH with Node.js and Crystal-specific paths
 * 3. Crystal-specific variables (MCP_SOCKET_PATH, MCP_DEBUG)
 *
 * This ensures that Claude Code processes have access to:
 * - User's third-party LLM provider credentials (ANTHROPIC_BASE_URL, etc.)
 * - Proper Node.js and tool PATHs
 * - Crystal's MCP communication variables
 *
 * @returns {Object} Merged environment ready for Claude Code processes
 *
 * @example
 * // Get complete environment for Claude Code process
 * const env = getMergedEnvironment();
 * // env now includes user's ANTHROPIC_BASE_URL, enhanced PATH, and MCP variables
 */
export function getMergedEnvironment(): { [key: string]: string } {
  try {
    // Get the complete shell environment (includes third-party LLM credentials)
    const shellEnv = getShellEnvironment();

    // Get the enhanced PATH from the shellPath utility (includes Linux-specific paths)
    const { getShellPath } = require('./shellPath');
    const enhancedPath = getShellPath();

    // Find Node.js and ensure it's in the PATH for Claude Code processes
    const { findNodeExecutable } = require('./nodeFinder');
    const nodePath = findNodeExecutable();
    const nodeDir = path.dirname(nodePath);
    const pathSeparator = process.platform === 'win32' ? ';' : ':';

    // Prepend Node.js directory to enhanced PATH to ensure Claude Code can find Node.js
    const pathWithNode = nodeDir + pathSeparator + enhancedPath;

    // Merge everything with proper precedence:
    // 1. Shell environment (base) - includes user's third-party LLM credentials
    // 2. Enhanced PATH - ensures Node.js and Crystal tools are available
    // 3. Crystal-specific variables - MCP communication and debugging
    return {
      ...shellEnv,
      PATH: pathWithNode,
      // Preserve Crystal-specific variables if they exist
      ...(process.env.MCP_SOCKET_PATH && { MCP_SOCKET_PATH: process.env.MCP_SOCKET_PATH }),
      ...(process.env.MCP_DEBUG && { MCP_DEBUG: process.env.MCP_DEBUG }),
    };

  } catch (error) {
    // Ultimate fallback to current process environment
    // This is a safety net to ensure Crystal always works, even if environment loading fails
    // Filter out undefined values to maintain consistent string-only environment
    const fallbackEnv: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        fallbackEnv[key] = value;
      }
    }
    return fallbackEnv;
  }
}