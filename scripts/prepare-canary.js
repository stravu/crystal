#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Path to the main package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');

// Read the package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Get git commit information
let gitCommit = 'unknown';
try {
  const gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  
  // Check if the working directory is clean (no uncommitted changes)
  try {
    execSync('git diff-index --quiet HEAD --', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    gitCommit = gitHash;
  } catch {
    // Working directory has uncommitted changes
    gitCommit = `${gitHash}`;
  }
} catch (err) {
  console.warn('Could not get git commit information:', err.message);
  gitCommit = Date.now().toString(36); // Fallback to timestamp-based ID
}

// Create canary version
const canaryVersion = `${packageJson.version}-canary.${gitCommit}`;

// Update the version in package.json
packageJson.version = canaryVersion;

// Write the updated package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`Updated version to canary build: ${canaryVersion}`);