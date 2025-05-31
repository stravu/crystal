import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function testClaudeCodeAvailability(): Promise<{ available: boolean; error?: string; version?: string }> {
  try {
    // Test if claude-code exists
    await execAsync('which claude-code');
    
    // Try to get version
    try {
      const { stdout } = await execAsync('claude-code --version', { timeout: 5000 });
      return { available: true, version: stdout.trim() };
    } catch (versionError) {
      // Command exists but version failed - might still work
      return { available: true, error: 'Could not get version info' };
    }
  } catch (error) {
    return { 
      available: false, 
      error: error instanceof Error ? error.message : 'Unknown error checking Claude Code availability' 
    };
  }
}

export async function testClaudeCodeInDirectory(directory: string): Promise<{ success: boolean; error?: string; output?: string }> {
  try {
    const { stdout, stderr } = await execAsync('claude-code --help', { 
      cwd: directory,
      timeout: 10000 
    });
    return { success: true, output: stdout + stderr };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error testing Claude Code in directory',
      output: error instanceof Error && 'stdout' in error ? String(error.stdout) + String(error.stderr) : undefined
    };
  }
}