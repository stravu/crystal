#!/usr/bin/env node

/**
 * Configure build settings based on environment
 * This script modifies electron-builder configuration dynamically
 * to handle signing when certificates are available or skip it when they're not
 */

const fs = require('fs');
const path = require('path');

function configureBuild() {
  console.log('Configuring build for current environment...');
  
  // Check if signing is explicitly disabled
  const signingDisabled = process.env.CSC_DISABLE === 'true';
  
  // Check if we have Apple signing credentials
  const hasAppleCertificate = !!(process.env.CSC_LINK || process.env.APPLE_CERTIFICATE);
  const hasAppleId = !!(process.env.APPLE_ID);
  const hasTeamId = !!(process.env.APPLE_TEAM_ID);
  const hasAppPassword = !!(process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_APP_PASSWORD);
  
  const canSign = !signingDisabled && hasAppleCertificate;
  const canNotarize = canSign && hasAppleId && hasTeamId && hasAppPassword;
  
  console.log('Environment check:');
  console.log(`  - Signing Disabled: ${signingDisabled ? '✓' : '✗'}`);
  console.log(`  - Apple Certificate: ${hasAppleCertificate ? '✓' : '✗'}`);
  console.log(`  - Apple ID: ${hasAppleId ? '✓' : '✗'}`);
  console.log(`  - Team ID: ${hasTeamId ? '✓' : '✗'}`);
  console.log(`  - App Password: ${hasAppPassword ? '✓' : '✗'}`);
  console.log(`  - Can Sign: ${canSign ? '✓' : '✗'}`);
  console.log(`  - Can Notarize: ${canNotarize ? '✓' : '✗'}`);
  
  // Read the package.json file
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Configure macOS build settings
  if (!packageJson.build || !packageJson.build.mac) {
    console.error('Error: No macOS build configuration found in package.json');
    process.exit(1);
  }
  
  // Update configuration based on capabilities
  packageJson.build.mac.notarize = canNotarize;
  
  if (!canSign) {
    // When we can't sign, we need to disable certain features
    console.log('Configuring for unsigned build...');
    packageJson.build.mac.hardenedRuntime = false;
    // Keep gatekeeperAssess as false - this allows unsigned apps to run
    packageJson.build.mac.gatekeeperAssess = false;
    // Remove signing-related entitlements when not signing
    delete packageJson.build.mac.entitlements;
    delete packageJson.build.mac.entitlementsInherit;
  } else {
    // When we can sign, enable the proper settings
    console.log('Configuring for signed build...');
    packageJson.build.mac.hardenedRuntime = true;
    packageJson.build.mac.gatekeeperAssess = false;
    packageJson.build.mac.entitlements = 'build/entitlements.mac.plist';
    packageJson.build.mac.entitlementsInherit = 'build/entitlements.mac.plist';
  }
  
  // Write the updated package.json back
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  
  console.log('Build configuration updated successfully!');
  console.log(`Notarization: ${packageJson.build.mac.notarize ? 'enabled' : 'disabled'}`);
  console.log(`Hardened Runtime: ${packageJson.build.mac.hardenedRuntime ? 'enabled' : 'disabled'}`);
}

if (require.main === module) {
  configureBuild();
}

module.exports = { configureBuild };