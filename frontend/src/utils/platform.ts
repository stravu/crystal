/**
 * Platform detection utilities for the frontend
 */

/**
 * Detect if the current platform is macOS
 */
export function isMac(): boolean {
  // Check for Mac using navigator.platform or navigator.userAgent
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) || 
         /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

/**
 * Get the modifier key name for keyboard shortcuts
 */
export function getModifierKey(): string {
  return isMac() ? '⌘' : 'Ctrl';
}

/**
 * Get the modifier key with Enter for keyboard shortcuts
 */
export function getModifierKeyWithEnter(): string {
  return isMac() ? '⌘↵' : 'Ctrl+Enter';
}

/**
 * Get the full modifier key name for display
 */
export function getModifierKeyName(): string {
  return isMac() ? 'Command' : 'Ctrl';
}