import { homedir } from 'os';
import { join } from 'path';
import { app } from 'electron';

let customCrystalDir: string | undefined;

/**
 * Sets a custom Crystal directory path. This should be called early in the
 * application lifecycle, before any services are initialized.
 */
export function setCrystalDirectory(dir: string): void {
  customCrystalDir = dir;
}

/**
 * Determines if Crystal is running from an installed application (DMG/Applications folder)
 * rather than a development build
 */
function isInstalledApp(): boolean {
  // Check if app is packaged (built for distribution)
  if (!app.isPackaged) {
    return false;
  }
  
  // On macOS, check if running from /Applications or a mounted DMG volume
  if (process.platform === 'darwin') {
    const appPath = app.getPath('exe');
    // Apps installed from DMG or in /Applications will have these paths
    const isInApplications = appPath.startsWith('/Applications/');
    const isInVolumes = appPath.startsWith('/Volumes/');
    const isInPrivateTmp = appPath.includes('/private/var/folders/'); // Temp mount for DMG
    
    return isInApplications || isInVolumes || isInPrivateTmp;
  }
  
  // For other platforms, being packaged is sufficient
  return true;
}

/**
 * Gets the Crystal directory path. Returns the custom directory if set,
 * otherwise falls back to the environment variable CRYSTAL_DIR,
 * and finally defaults to ~/.crystal
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

  // 3. If running as an installed app (from DMG, /Applications, etc), always use ~/.crystal
  if (isInstalledApp()) {
    console.log('[Crystal] Running as installed app, using ~/.crystal');
    return join(homedir(), '.crystal');
  }

  // 4. If running inside Crystal (detected by bundle identifier) in development, use development directory
  // This prevents development Crystal from interfering with production Crystal
  if (process.env.__CFBundleIdentifier === 'com.stravu.crystal' && !app.isPackaged) {
    console.log('[Crystal] Detected running inside Crystal development, using ~/.crystal_dev for isolation');
    return join(homedir(), '.crystal_dev');
  }

  // 5. Default to ~/.crystal
  return join(homedir(), '.crystal');
}

/**
 * Gets a subdirectory path within the Crystal directory
 */
export function getCrystalSubdirectory(...subPaths: string[]): string {
  return join(getCrystalDirectory(), ...subPaths);
}