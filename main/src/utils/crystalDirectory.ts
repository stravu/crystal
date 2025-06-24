import { homedir } from 'os';
import { join } from 'path';

let customCrystalDir: string | undefined;

/**
 * Sets a custom Crystal directory path. This should be called early in the
 * application lifecycle, before any services are initialized.
 */
export function setCrystalDirectory(dir: string): void {
  customCrystalDir = dir;
}

/**
 * Gets the Crystal directory path. Returns the custom directory if set,
 * otherwise falls back to the environment variable CRYSTAL_DIR,
 * and finally defaults to platform-specific location
 */
export function getCrystalDirectory(): string {
  // 1. Check if custom directory was set programmatically
  if (customCrystalDir) {
    return customCrystalDir;
  }

  // 2. Check environment variable
  const envDir = process.env.CRYSTAL_DIR;
  if (envDir) {
    return envDir;
  }

  // 3. Default to platform-specific location
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // On Windows, use %APPDATA%\Crystal for better integration
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'Crystal');
  } else {
    // On Unix-like systems, use ~/.crystal
    return join(homedir(), '.crystal');
  }
}

/**
 * Gets a subdirectory path within the Crystal directory
 */
export function getCrystalSubdirectory(...subPaths: string[]): string {
  return join(getCrystalDirectory(), ...subPaths);
}