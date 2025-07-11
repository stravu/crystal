#!/usr/bin/env node

/**
 * Test script to verify secure storage implementation
 * Run with: node test-secure-storage.js
 */

const { safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock electron's safeStorage for testing outside of Electron
if (!safeStorage) {
  console.log('This script must be run within an Electron environment');
  console.log('Use: electron test-secure-storage.js');
  process.exit(1);
}

const ENCRYPTED_PREFIX = 'enc:';

function encryptValue(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) {
    return value;
  }
  
  // If already encrypted, return as is
  if (value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }
  
  try {
    const encrypted = safeStorage.encryptString(value);
    // Convert Buffer to base64 string and add prefix
    return ENCRYPTED_PREFIX + encrypted.toString('base64');
  } catch (error) {
    console.error('Failed to encrypt value:', error);
    return value;
  }
}

function decryptValue(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) {
    return value;
  }
  
  // Check if value is encrypted
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }
  
  try {
    // Remove prefix and convert base64 back to Buffer
    const encrypted = value.substring(ENCRYPTED_PREFIX.length);
    const buffer = Buffer.from(encrypted, 'base64');
    return safeStorage.decryptString(buffer);
  } catch (error) {
    console.error('Failed to decrypt value:', error);
    return undefined;
  }
}

// Test the encryption/decryption
console.log('Testing Electron safeStorage API...\n');

console.log('Is encryption available?', safeStorage.isEncryptionAvailable());

if (safeStorage.isEncryptionAvailable()) {
  const testApiKey = 'sk-ant-api03-test-key-12345';
  console.log('\nOriginal API key:', testApiKey);
  
  const encrypted = encryptValue(testApiKey);
  console.log('Encrypted value:', encrypted);
  console.log('Is encrypted:', encrypted.startsWith(ENCRYPTED_PREFIX));
  
  const decrypted = decryptValue(encrypted);
  console.log('Decrypted value:', decrypted);
  console.log('Matches original:', decrypted === testApiKey);
  
  // Test with already encrypted value
  console.log('\nTesting double encryption prevention...');
  const doubleEncrypted = encryptValue(encrypted);
  console.log('Double encryption attempt result:', doubleEncrypted);
  console.log('Prevented double encryption:', doubleEncrypted === encrypted);
  
  // Test config file simulation
  console.log('\nSimulating config file storage...');
  const config = {
    gitRepoPath: os.homedir(),
    verbose: false,
    anthropicApiKey: encryptValue('sk-ant-api03-real-key'),
    stravuApiKey: encryptValue('stravu-test-key-123'),
    stravuServerUrl: 'https://api.stravu.com'
  };
  
  const configJson = JSON.stringify(config, null, 2);
  console.log('Config to save:\n', configJson);
  
  // Simulate loading
  const loadedConfig = JSON.parse(configJson);
  console.log('\nLoaded and decrypted config:');
  console.log('anthropicApiKey:', decryptValue(loadedConfig.anthropicApiKey));
  console.log('stravuApiKey:', decryptValue(loadedConfig.stravuApiKey));
} else {
  console.log('\nEncryption is not available on this system.');
  console.log('API keys would be stored in plain text.');
}