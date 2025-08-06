import { execSync } from 'child_process';
import * as os from 'os';

/**
 * Gets all child process IDs for a given parent process ID.
 * Works on both Windows (using PowerShell/wmic) and Unix systems.
 */
export function getChildProcessIds(parentPid: number): number[] {
  const children: number[] = [];
  const platform = os.platform();
  
  try {
    if (platform === 'win32') {
      // Windows: Use PowerShell to get child processes (wmic is deprecated in Windows 11)
      try {
        // First try PowerShell (works on all modern Windows)
        const result = execSync(
          `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${parentPid} } | Select-Object -ExpandProperty ProcessId"`,
          { encoding: 'utf8', windowsHide: true }
        );
        
        const pids = result.split('\n')
          .map((line: string) => parseInt(line.trim()))
          .filter((pid: number) => !isNaN(pid) && pid !== parentPid);
        
        children.push(...pids);
      } catch (psError) {
        // Fallback to wmic for older Windows versions
        try {
          const result = execSync(
            `wmic process where (ParentProcessId=${parentPid}) get ProcessId`,
            { encoding: 'utf8', windowsHide: true }
          );
          
          const lines = result.split('\n').filter((line: string) => line.trim());
          for (let i = 1; i < lines.length; i++) { // Skip header
            const pid = parseInt(lines[i].trim());
            if (!isNaN(pid) && pid !== parentPid) {
              children.push(pid);
            }
          }
        } catch (wmicError) {
          // If both fail, just log and continue (process might already be gone)
          console.warn(`Could not get child processes for PID ${parentPid} (process may have already exited)`);
        }
      }
    } else {
      // Unix/Linux/macOS: Use ps command
      const result = execSync(
        `ps -o pid= --ppid ${parentPid} 2>/dev/null || true`,
        { encoding: 'utf8' }
      );
      
      const pids = result.split('\n')
        .map((line: string) => parseInt(line.trim()))
        .filter((pid: number) => !isNaN(pid) && pid !== parentPid);
      
      children.push(...pids);
    }
  } catch (error) {
    console.warn(`Error getting child PIDs for ${parentPid}:`, error);
  }
  
  return children;
}

/**
 * Gets all descendant process IDs (children, grandchildren, etc.) recursively.
 */
export function getAllDescendantPids(parentPid: number): number[] {
  const descendants: number[] = [];
  const children = getChildProcessIds(parentPid);
  
  for (const childPid of children) {
    descendants.push(childPid);
    // Recursively get descendants of this child
    descendants.push(...getAllDescendantPids(childPid));
  }
  
  // Remove duplicates
  return [...new Set(descendants)];
}

/**
 * Gets the process name for a given PID.
 * Returns null if the process doesn't exist or can't be accessed.
 */
export function getProcessName(pid: number): string | null {
  const platform = os.platform();
  
  try {
    if (platform === 'win32') {
      // Windows: Use PowerShell to get process name (wmic is deprecated in Windows 11)
      try {
        // First try PowerShell (works on all modern Windows)
        const result = execSync(
          `powershell -NoProfile -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"`,
          { encoding: 'utf8', windowsHide: true }
        );
        
        const name = result.trim();
        return name || null;
      } catch (psError) {
        // Fallback to wmic for older Windows versions
        try {
          const result = execSync(
            `wmic process where ProcessId=${pid} get Name`,
            { encoding: 'utf8', windowsHide: true }
          );
          
          const lines = result.split('\n').filter((line: string) => line.trim());
          if (lines.length > 1) {
            // Skip the header line and get the process name
            return lines[1].trim() || null;
          }
        } catch (wmicError) {
          // Process doesn't exist or can't be accessed
          return null;
        }
      }
    } else {
      // Unix/Linux/macOS: Use ps command
      const result = execSync(
        `ps -p ${pid} -o comm= 2>/dev/null || true`,
        { encoding: 'utf8' }
      );
      
      const name = result.trim();
      return name || null;
    }
  } catch (error) {
    // Process doesn't exist or can't be accessed
    return null;
  }
  
  return null;
}