import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function setupTestProject() {
  // Create a temporary test project directory
  const testProjectPath = path.join(os.tmpdir(), `crystal-test-${Date.now()}`);
  fs.mkdirSync(testProjectPath, { recursive: true });
  
  // Initialize git in the test directory
  const { execSync } = require('child_process');
  execSync('git init -b main', { cwd: testProjectPath, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: testProjectPath, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: testProjectPath, stdio: 'pipe' });
  
  // Create README.md using Node.js fs instead of touch (Windows compatible)
  fs.writeFileSync(path.join(testProjectPath, 'README.md'), '# Test Project\n');
  
  execSync('git add .', { cwd: testProjectPath });
  execSync('git commit -m "Initial commit"', { cwd: testProjectPath });
  
  return testProjectPath;
}

export async function cleanupTestProject(projectPath: string) {
  // Guard against undefined path
  if (!projectPath) {
    console.warn('Cannot cleanup test project: path is undefined');
    return;
  }
  
  try {
    fs.rmSync(projectPath, { recursive: true, force: true });
  } catch (error) {
    console.error('Failed to cleanup test project:', error);
  }
}