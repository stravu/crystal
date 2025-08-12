/**
 * Path utilities for the frontend
 * These functions handle cross-platform path operations in the browser
 */

/**
 * Get the path separator for the current platform
 * This is determined from paths received from the backend
 */
export function getPathSeparator(samplePath?: string): string {
  // If we have a sample path, detect the separator
  if (samplePath) {
    if (samplePath.includes('\\') && !samplePath.includes('/')) {
      return '\\';
    }
  }
  
  // Default to forward slash (works for Unix and URLs)
  return '/';
}

/**
 * Get the parent directory of a path
 * Works with both Windows and Unix paths
 */
export function getParentPath(filePath: string): string {
  const separator = getPathSeparator(filePath);
  const parts = filePath.split(separator);
  
  // Remove the last part (filename or directory)
  parts.pop();
  
  // Join back together
  return parts.join(separator) || '';
}

/**
 * Get the basename (filename) from a path
 * Works with both Windows and Unix paths
 */
export function getBasename(filePath: string): string {
  const separator = getPathSeparator(filePath);
  const parts = filePath.split(separator);
  return parts[parts.length - 1] || '';
}

/**
 * Join path segments
 * Automatically detects the separator to use
 */
export function joinPath(...segments: string[]): string {
  if (segments.length === 0) return '';
  
  // Detect separator from the first segment that contains one
  let separator = '/';
  for (const segment of segments) {
    if (segment.includes('\\') && !segment.includes('/')) {
      separator = '\\';
      break;
    }
  }
  
  // Filter out empty segments and join
  return segments.filter(s => s).join(separator);
}

/**
 * Normalize a path (remove redundant separators, etc.)
 */
export function normalizePath(filePath: string): string {
  const separator = getPathSeparator(filePath);
  
  // Split by separator and filter out empty parts
  const parts = filePath.split(separator).filter(part => part);
  
  // Rejoin with consistent separator
  return parts.join(separator);
}

/**
 * Get the last N parts of a path
 * Useful for displaying shortened paths
 */
export function getPathTail(filePath: string, n: number = 1): string {
  const separator = getPathSeparator(filePath);
  const parts = filePath.split(separator);
  return parts.slice(-n).join(separator);
}