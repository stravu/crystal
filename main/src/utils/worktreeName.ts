/**
 * Utility for resolving worktree names during rename operations
 */

export interface ResolveResult {
  success: true;
  name: string;
}

export interface ResolveError {
  success: false;
  error: string;
}

export type ResolveResponse = ResolveResult | ResolveError;

// Validation helper functions
function validateDuplicateParts(resolvedName: string): ResolveError | null {
  if (!resolvedName.includes('/')) return null;
  
  const parts = resolvedName.split('/');
  for (let i = 0; i < parts.length - 1; i++) {
    const currentPart = parts[i];
    const nextPart = parts[i + 1];
    
    // Check for exact duplicates
    if (currentPart === nextPart) {
      return { success: false, error: `Invalid path structure: ${resolvedName}. Contains duplicate parts: ${currentPart}` };
    }
  }
  return null;
}

function validateNestedAtPrefixes(resolvedName: string): ResolveError | null {
  if (!resolvedName.includes('/')) return null;
  
  const parts = resolvedName.split('/');
  for (let i = 0; i < parts.length - 1; i++) {
    const currentPart = parts[i];
    const nextPart = parts[i + 1];
    
    // Check for @prefix/@prefix patterns
    if (currentPart.startsWith('@') && nextPart.startsWith('@')) {
      return { success: false, error: `Invalid path structure: ${resolvedName}. Contains nested @ prefixes` };
    }
  }
  return null;
}

function validateNormalizedDuplicates(resolvedName: string): ResolveError | null {
  if (!resolvedName.includes('/')) return null;
  
  const parts = resolvedName.split('/');
  for (let i = 0; i < parts.length - 1; i++) {
    const currentPart = parts[i];
    const nextPart = parts[i + 1];
    
    // Check for normalized duplicates (feature vs @feature)
    const normalizedCurrent = currentPart.replace(/^@/, '');
    const normalizedNext = nextPart.replace(/^@/, '');
    if (normalizedCurrent === normalizedNext) {
      return { success: false, error: `Invalid path structure: ${resolvedName}. Contains duplicate prefixes: ${normalizedCurrent}` };
    }
  }
  return null;
}

function validateInvalidSeparators(resolvedName: string): ResolveError | null {
  if (resolvedName.includes('//') || resolvedName.startsWith('/') || resolvedName.endsWith('/')) {
    return { success: false, error: `Invalid path structure: ${resolvedName}. Contains invalid path separators` };
  }
  return null;
}

function validateEmptySegments(resolvedName: string): ResolveError | null {
  if (resolvedName.split('/').some(part => !part.trim())) {
    return { success: false, error: `Invalid path structure: ${resolvedName}. Contains empty path segments` };
  }
  return null;
}

/**
 * Resolves the new worktree name based on current name and user input
 * Handles prefix logic to prevent double-prefixing issues
 */
export function resolveNewWorktreeName(currentName: string, userInput: string): ResolveResponse {
  // Validate inputs
  if (!currentName || !userInput) {
    return { success: false, error: 'Current name and user input are required' };
  }

  if (!userInput.trim()) {
    return { success: false, error: 'User input cannot be empty' };
  }

  const trimmedInput = userInput.trim();

  // Parse current prefix - extract everything except the last segment (the actual name)
  let currentPrefix = '';
  
  if (currentName.includes('/')) {
    const parts = currentName.split('/');
    // Keep all parts except the last one as the prefix
    if (parts.length > 1) {
      currentPrefix = parts.slice(0, -1).join('/') + '/';
    }
  }
  
  // Parse user input
  const userHasSlash = trimmedInput.includes('/');
  
  let resolvedName: string;

  // Simplified prefix resolution logic
  if (currentPrefix && !userHasSlash && !trimmedInput.startsWith(currentPrefix)) {
    // Only prepend currentPrefix if:
    // 1. currentPrefix exists
    // 2. user input does not have a slash 
    // 3. trimmedInput does not start with currentPrefix
    resolvedName = currentPrefix + trimmedInput;
  } else {
    // Otherwise, return trimmedInput directly
    resolvedName = trimmedInput;
  }

  // Validate the resolved name using helper functions
  const validationError = 
    validateDuplicateParts(resolvedName) ||
    validateNestedAtPrefixes(resolvedName) ||
    validateNormalizedDuplicates(resolvedName) ||
    validateInvalidSeparators(resolvedName) ||
    validateEmptySegments(resolvedName);

  if (validationError) {
    return validationError;
  }

  return { success: true, name: resolvedName };
}