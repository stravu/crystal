/**
 * Safely escape shell arguments to prevent command injection
 */

/**
 * Escape a string for safe use in shell commands
 * @param arg The argument to escape
 * @returns The escaped argument
 */
export function escapeShellArg(arg: string): string {
  // If the argument is empty, return empty quotes
  if (!arg) return "''";
  
  // For Windows, wrap in double quotes and escape internal quotes
  if (process.platform === 'win32') {
    // Escape existing double quotes and backslashes
    const escaped = arg
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  
  // For Unix-like systems, use single quotes and handle internal single quotes
  // by ending the quote, adding an escaped single quote, and starting a new quote
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * Build a safe git commit command with proper escaping
 * @param message The commit message
 * @param enableCrystalFooter If true (default), add the Crystal footer
 * @returns The safe commit command
 */
export function buildGitCommitCommand(message: string, enableCrystalFooter: boolean = true): string {
  // Create the full commit message with signature
  const fullMessage = enableCrystalFooter ? `${message}

💎 Built using [Crystal](https://github.com/stravu/crystal)

Co-Authored-By: Crystal <crystal@stravu.com>` : message;
  
  // For Windows, use a different approach
  if (process.platform === 'win32') {
    // Write to a temporary file or use -F - with stdin
    // For now, escape for direct use
    const escaped = fullMessage
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
    return `git commit -m "${escaped}"`;
  }
  
  // For Unix-like systems, use proper shell escaping
  const escapedMessage = escapeShellArg(fullMessage);
  return `git commit -m ${escapedMessage}`;
}

/**
 * Escape an array of shell arguments
 * @param args The arguments to escape
 * @returns The escaped arguments joined with spaces
 */
export function escapeShellArgs(args: string[]): string {
  return args.map(escapeShellArg).join(' ');
}

/**
 * Build a safe shell command with escaped arguments
 * @param command The base command
 * @param args The arguments to escape and append
 * @returns The safe command string
 */
export function buildSafeCommand(command: string, ...args: string[]): string {
  if (args.length === 0) return command;
  return `${command} ${escapeShellArgs(args)}`;
}