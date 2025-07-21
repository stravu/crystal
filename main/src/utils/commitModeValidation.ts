/**
 * Security validation utilities for commit mode functionality
 */

import { CommitModeSettings, FinalizeSessionOptions } from '../../../shared/types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate commit mode settings for security issues
 */
export function validateCommitModeSettings(settings: CommitModeSettings): ValidationResult {
  const errors: string[] = [];

  // Validate mode
  const validModes = ['structured', 'checkpoint', 'disabled'];
  if (!validModes.includes(settings.mode)) {
    errors.push(`Invalid commit mode: ${settings.mode}. Must be one of: ${validModes.join(', ')}`);
  }

  // Validate checkpoint prefix
  if (settings.checkpointPrefix !== undefined) {
    const prefixValidation = validateCheckpointPrefix(settings.checkpointPrefix);
    if (!prefixValidation.isValid) {
      errors.push(...prefixValidation.errors);
    }
  }

  // Validate structured prompt template
  if (settings.structuredPromptTemplate !== undefined) {
    const templateValidation = validateStructuredPromptTemplate(settings.structuredPromptTemplate);
    if (!templateValidation.isValid) {
      errors.push(...templateValidation.errors);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate checkpoint prefix for security issues
 */
export function validateCheckpointPrefix(prefix: string): ValidationResult {
  const errors: string[] = [];

  // Check for null/undefined (converted to string)
  if (typeof prefix !== 'string') {
    errors.push('Checkpoint prefix must be a string');
    return { isValid: false, errors };
  }

  // Length limits
  if (prefix.length > 100) {
    errors.push('Checkpoint prefix must be 100 characters or less');
  }

  // Dangerous characters that could cause command injection
  const dangerousChars = /[`$\\;|&<>(){}[\]'"]/;
  if (dangerousChars.test(prefix)) {
    errors.push('Checkpoint prefix contains potentially dangerous characters: ` $ \\ ; | & < > ( ) { } [ ] \' "');
  }

  // Newline/control characters
  if (/[\r\n\t\x00-\x1F\x7F-\x9F]/.test(prefix)) {
    errors.push('Checkpoint prefix contains control characters');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate structured prompt template for security issues
 */
export function validateStructuredPromptTemplate(template: string): ValidationResult {
  const errors: string[] = [];

  // Check for null/undefined (converted to string)
  if (typeof template !== 'string') {
    errors.push('Structured prompt template must be a string');
    return { isValid: false, errors };
  }

  // Length limits (more generous for templates)
  if (template.length > 5000) {
    errors.push('Structured prompt template must be 5000 characters or less');
  }

  // Check for dangerous shell injection patterns
  const dangerousPatterns = [
    /\$\([^)]*\)/,  // Command substitution $(...)
    /`[^`]*`/,      // Command substitution backticks
    /\|\s*\w+/,     // Pipe to commands
    /;\s*\w+/,      // Command chaining
    /&&\s*\w+/,     // Command chaining
    /\|\|\s*\w+/,   // Command chaining
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(template)) {
      errors.push('Structured prompt template contains potentially dangerous shell patterns');
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate finalize session options for security issues
 */
export function validateFinalizeSessionOptions(options: FinalizeSessionOptions): ValidationResult {
  const errors: string[] = [];

  // Validate commit message
  if (options.commitMessage !== undefined) {
    if (typeof options.commitMessage !== 'string') {
      errors.push('Commit message must be a string');
    } else if (options.commitMessage.length > 500) {
      errors.push('Commit message must be 500 characters or less');
    }
  }

  // Validate post-processing commands (high risk)
  if (options.postProcessingCommands !== undefined) {
    if (!Array.isArray(options.postProcessingCommands)) {
      errors.push('Post-processing commands must be an array');
    } else {
      for (let i = 0; i < options.postProcessingCommands.length; i++) {
        const cmd = options.postProcessingCommands[i];
        if (typeof cmd !== 'string') {
          errors.push(`Post-processing command ${i} must be a string`);
        } else if (cmd.length > 500) {
          errors.push(`Post-processing command ${i} must be 500 characters or less`);
        } else {
          // This is extremely dangerous - arbitrary command execution
          // We should strongly restrict this to known safe commands
          const cmdValidation = validatePostProcessingCommand(cmd);
          if (!cmdValidation.isValid) {
            errors.push(...cmdValidation.errors.map(e => `Post-processing command ${i}: ${e}`));
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate individual post-processing commands (VERY RESTRICTIVE)
 * 
 * SECURITY NOTE: Post-processing commands are extremely dangerous as they allow
 * arbitrary code execution. This function is intentionally very restrictive.
 * Only a small whitelist of safe package manager commands are allowed.
 */
export function validatePostProcessingCommand(command: string): ValidationResult {
  const errors: string[] = [];

  // Only allow a very limited set of safe package manager commands
  // NO git commands, NO echo commands, NO file operations
  const allowedCommands = [
    /^npm\s+(test|build|lint|format)(\s+--[\w-]+)*$/,
    /^pnpm\s+(test|build|lint|format)(\s+--[\w-]+)*$/,
    /^yarn\s+(test|build|lint|format)(\s+--[\w-]+)*$/,
  ];

  const isAllowed = allowedCommands.some(pattern => pattern.test(command));
  
  if (!isAllowed) {
    errors.push(`Command not in allowed list: ${command}`);
  }

  // Additional comprehensive safety checks
  const dangerousPatterns = [
    /[`$();|&<>{}[\]]/,     // Shell metacharacters
    /\.\./,                 // Directory traversal
    /\/bin\/|\/usr\/bin\//,  // Direct binary paths
    /sudo|su\s+/,          // Privilege escalation
    /rm\s+|del\s+/,        // File deletion
    /chmod|chown/,         // Permission changes
    /curl|wget|fetch/,     // Network requests
    /git\s+/,              // Git commands (too dangerous)
    /echo\s+/,             // Echo commands (can be used for injection)
    /cat\s+|less\s+|more\s+/, // File reading
    /touch\s+|mkdir\s+/,   // File/directory creation
    /mv\s+|cp\s+/,         // File operations
    /find\s+|grep\s+/,     // Search operations
    /sh\s+|bash\s+|zsh\s+/, // Shell execution
    /python|node|ruby/,    // Script execution
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      errors.push(`Command contains dangerous patterns: ${command}`);
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize a commit mode settings object by removing/fixing invalid fields
 */
export function sanitizeCommitModeSettings(settings: any): CommitModeSettings {
  const sanitized: CommitModeSettings = {
    mode: 'disabled', // Safe default
  };

  // Validate and set mode
  const validModes = ['structured', 'checkpoint', 'disabled'];
  if (validModes.includes(settings.mode)) {
    sanitized.mode = settings.mode;
  }

  // Sanitize checkpoint prefix
  if (settings.checkpointPrefix && typeof settings.checkpointPrefix === 'string') {
    const prefixValidation = validateCheckpointPrefix(settings.checkpointPrefix);
    if (prefixValidation.isValid) {
      sanitized.checkpointPrefix = settings.checkpointPrefix;
    }
  }

  // Sanitize structured prompt template
  if (settings.structuredPromptTemplate && typeof settings.structuredPromptTemplate === 'string') {
    const templateValidation = validateStructuredPromptTemplate(settings.structuredPromptTemplate);
    if (templateValidation.isValid) {
      sanitized.structuredPromptTemplate = settings.structuredPromptTemplate;
    }
  }

  // Sanitize allowClaudeTools
  if (typeof settings.allowClaudeTools === 'boolean') {
    sanitized.allowClaudeTools = settings.allowClaudeTools;
  }

  return sanitized;
}