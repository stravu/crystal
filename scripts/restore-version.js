#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Restore the original package.json version from git
try {
  execSync('git checkout HEAD -- package.json', { stdio: 'inherit' });
  console.log('Restored original package.json version');
} catch (err) {
  console.error('Failed to restore package.json:', err.message);
  process.exit(1);
}