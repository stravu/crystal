#!/usr/bin/env node

/**
 * Configure build settings specifically for Arch Linux builds
 * This script modifies electron-builder configuration to use "stravu-crystal" naming
 * for Arch Linux to avoid conflicts with the existing "crystal" package (Crystal language)
 */

const fs = require('fs');
const path = require('path');

function configureArchBuild() {
  console.log('Configuring build for Arch Linux with stravu-crystal naming...');
  
  // Read the package.json file
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  if (!packageJson.build || !packageJson.build.linux) {
    console.error('Error: No Linux build configuration found in package.json');
    process.exit(1);
  }
  
  // Store original values for restoration
  const originalProductName = packageJson.build.productName;
  const originalStartupWMClass = packageJson.build.linux.desktop?.StartupWMClass;
  const originalPacmanArtifactName = packageJson.build.pacman?.artifactName;
  
  console.log('Original configuration:');
  console.log(`  - Product Name: ${originalProductName || packageJson.name}`);
  console.log(`  - StartupWMClass: ${originalStartupWMClass || 'crystal'}`);
  console.log(`  - Pacman Artifact Name: ${originalPacmanArtifactName || 'default'}`);
  
  // Update configuration for Arch Linux
  packageJson.build.productName = 'stravu-crystal';
  
  // Ensure desktop configuration exists
  if (!packageJson.build.linux.desktop) {
    packageJson.build.linux.desktop = {};
  }
  
  // Update desktop entry
  packageJson.build.linux.desktop.Name = 'stravu-crystal';
  packageJson.build.linux.desktop.StartupWMClass = 'stravu-crystal';
  
  // Update pacman artifact name
  if (!packageJson.build.pacman) {
    packageJson.build.pacman = {};
  }
  packageJson.build.pacman.artifactName = 'stravu-crystal-${version}-linux-${arch}.pkg.tar.xz';
  
  console.log('Updated configuration:');
  console.log(`  - Product Name: ${packageJson.build.productName}`);
  console.log(`  - Desktop Name: ${packageJson.build.linux.desktop.Name}`);
  console.log(`  - StartupWMClass: ${packageJson.build.linux.desktop.StartupWMClass}`);
  console.log(`  - Pacman Artifact Name: ${packageJson.build.pacman.artifactName}`);
  
  // Write the updated package.json back
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  
  console.log('Arch Linux build configuration updated successfully!');
  
  // Return original values for potential restoration
  return {
    originalProductName,
    originalStartupWMClass,
    originalPacmanArtifactName
  };
}

function restoreOriginalConfig() {
  console.log('Restoring original build configuration...');
  
  // Read the package.json file
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Restore original values
  packageJson.build.productName = 'Crystal';
  
  if (packageJson.build.linux && packageJson.build.linux.desktop) {
    packageJson.build.linux.desktop.Name = 'Crystal';
    packageJson.build.linux.desktop.StartupWMClass = 'crystal';
  }
  
  if (packageJson.build.pacman) {
    packageJson.build.pacman.artifactName = '${productName}-${version}-linux-${arch}.pkg.tar.xz';
  }
  
  // Write the restored package.json back
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  
  console.log('Original build configuration restored successfully!');
}

if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'restore') {
    restoreOriginalConfig();
  } else {
    configureArchBuild();
  }
}

module.exports = { configureArchBuild, restoreOriginalConfig };