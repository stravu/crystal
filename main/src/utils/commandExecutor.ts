import { execSync as nodeExecSync, ExecSyncOptions, ExecSyncOptionsWithStringEncoding, ExecSyncOptionsWithBufferEncoding } from 'child_process';
import { getShellPath } from './shellPath';

class CommandExecutor {
  execSync(command: string, options: ExecSyncOptionsWithStringEncoding): string;
  execSync(command: string, options?: ExecSyncOptionsWithBufferEncoding): Buffer;
  execSync(command: string, options?: ExecSyncOptions): string | Buffer {
    // Log the command being executed
    const cwd = options?.cwd || process.cwd();
    console.log(`[CommandExecutor] Executing: ${command} in ${cwd}`);

    // Get enhanced shell PATH
    const shellPath = getShellPath();
    
    // Merge enhanced PATH into options
    const enhancedOptions = {
      ...options,
      env: {
        ...process.env,
        ...options?.env,
        PATH: shellPath
      }
    };

    try {
      const result = nodeExecSync(command, enhancedOptions as any);
      
      // Log success with a preview of the result
      if (result) {
        const resultStr = result.toString();
        const lines = resultStr.split('\n');
        const preview = lines[0].substring(0, 100) + 
                        (lines.length > 1 ? ` ... (${lines.length} lines)` : '');
        console.log(`[CommandExecutor] Success: ${preview}`);
      }
      
      return result;
    } catch (error: any) {
      // Log error
      console.error(`[CommandExecutor] Failed: ${command}`);
      console.error(`[CommandExecutor] Error: ${error.message}`);
      
      throw error;
    }
  }
}

// Export a singleton instance
export const commandExecutor = new CommandExecutor();

// Export the execSync function as a drop-in replacement
export const execSync = commandExecutor.execSync.bind(commandExecutor);