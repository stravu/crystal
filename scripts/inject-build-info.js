#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get the build date
const buildDate = new Date().toISOString();

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
    execSync('git diff-index --quiet HEAD --', { encoding: 'utf8' });
    gitCommit = gitHash;
  } catch {
    // Working directory has uncommitted changes
    gitCommit = `${gitHash} (modified)`;
  }
} catch (err) {
  console.warn('Could not get git commit information:', err.message);
  gitCommit = 'unknown';
}

// Create build info
const buildInfo = {
  version: packageJson.version,
  buildDate: buildDate,
  gitCommit: gitCommit,
  buildTimestamp: Date.now(),
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch
};

// Write build info to a file in the main dist directory
const buildInfoPath = path.join(__dirname, '..', 'main', 'dist', 'buildInfo.json');

// Ensure the dist directory exists
const distDir = path.join(__dirname, '..', 'main', 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Write the build info
fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));

console.log('Build info injected:', buildInfo);