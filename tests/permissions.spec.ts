import { test, expect } from '@playwright/test';
import { setupTestProject, cleanupTestProject } from './setup';

test.describe('Permission Flow', () => {
  let testProjectPath: string;
  
  test.beforeAll(async () => {
    testProjectPath = await setupTestProject();
  });
  
  test.afterAll(async () => {
    await cleanupTestProject(testProjectPath);
  });
  // Helper to navigate to the app and set up a project
  async function navigateToApp(page) {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
    
    // Handle Welcome dialog if it appears
    const getStartedButton = page.locator('button:has-text("Get Started")');
    if (await getStartedButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await getStartedButton.click();
      // Wait for welcome dialog to close
      await page.waitForSelector('text="Welcome to Crystal"', { state: 'hidden' });
    }
    
    // Check if we need to select a project
    const selectProjectButton = page.locator('button:has-text("Select Project")');
    if (await selectProjectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await selectProjectButton.click();
      
      // Wait for project dialog
      await page.waitForSelector('text="Select or Create Project"');
      
      // Click create new project
      await page.click('button:has-text("Create New Project")');
      
      // Fill in project details
      await page.fill('input[placeholder*="project name"]', 'Test Project');
      await page.fill('input[placeholder*="directory"]', testProjectPath);
      
      // Submit
      await page.click('button[type="submit"]:has-text("Create")');
      
      // Wait for dialog to close
      await page.waitForSelector('text="Select or Create Project"', { state: 'hidden' });
    }
    
    // Wait for the sidebar to be visible
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: 30000 });
  }

  // Helper to create a session with permission mode
  async function createSessionWithPermissions(page, prompt: string, permissionMode: 'approve' | 'ignore') {
    // Click create session button
    await page.click('[data-testid="create-session-button"]');
    
    // Wait for dialog
    await page.waitForSelector('[data-testid="create-session-dialog"]');
    
    // Fill in prompt
    await page.fill('textarea[id="prompt"]', prompt);
    
    // Select permission mode
    await page.click(`input[name="permissionMode"][value="${permissionMode}"]`);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Wait for dialog to close
    await page.waitForSelector('[data-testid="create-session-dialog"]', { state: 'hidden' });
  }

  test('should show permission mode option in create session dialog', async ({ page }) => {
    await navigateToApp(page);
    
    // Open create session dialog
    await page.click('[data-testid="create-session-button"]');
    
    // Check that permission mode options are visible
    await expect(page.locator('input[name="permissionMode"][value="ignore"]')).toBeVisible();
    await expect(page.locator('input[name="permissionMode"][value="approve"]')).toBeVisible();
    
    // Check default selection
    await expect(page.locator('input[name="permissionMode"][value="ignore"]')).toBeChecked();
  });

  test('should show permission mode in settings', async ({ page }) => {
    await navigateToApp(page);
    
    // Open settings
    await page.click('[data-testid="settings-button"]');
    
    // Check that default permission mode options are visible
    await expect(page.locator('input[name="defaultPermissionMode"][value="ignore"]')).toBeVisible();
    await expect(page.locator('input[name="defaultPermissionMode"][value="approve"]')).toBeVisible();
  });

  test('should create session with skip permissions mode', async ({ page }) => {
    await navigateToApp(page);
    
    await createSessionWithPermissions(page, 'Test skip permissions', 'ignore');
    
    // Verify session was created
    await expect(page.locator('text=Test skip permissions')).toBeVisible({ timeout: 10000 });
  });

  test('should create session with approve permissions mode', async ({ page }) => {
    await navigateToApp(page);
    
    await createSessionWithPermissions(page, 'Test approve permissions', 'approve');
    
    // Verify session was created
    await expect(page.locator('text=Test approve permissions')).toBeVisible({ timeout: 10000 });
  });

  test('should show permission dialog when Claude requests permission', async ({ page }) => {
    // This test would require mocking the Claude process to trigger a permission request
    // For now, we'll test that the permission dialog component renders correctly
    
    await navigateToApp(page);
    
    // Inject a mock permission request
    await page.evaluate(() => {
      window.postMessage({
        type: 'permission:request',
        data: {
          id: 'test-request-1',
          sessionId: 'test-session-1',
          toolName: 'Bash',
          input: { command: 'npm install', description: 'Install dependencies' },
          timestamp: Date.now()
        }
      }, '*');
    });
    
    // Wait for permission dialog
    await expect(page.locator('text=Permission Required')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Claude wants to Execute shell commands')).toBeVisible();
    await expect(page.locator('text=npm install')).toBeVisible();
    
    // Check that Allow and Deny buttons are present
    await expect(page.locator('button:has-text("Allow")')).toBeVisible();
    await expect(page.locator('button:has-text("Deny")')).toBeVisible();
  });

  test('should handle allow permission response', async ({ page }) => {
    await navigateToApp(page);
    
    // Inject a mock permission request
    await page.evaluate(() => {
      window.postMessage({
        type: 'permission:request',
        data: {
          id: 'test-request-2',
          sessionId: 'test-session-2',
          toolName: 'Write',
          input: { file_path: '/tmp/test.txt', content: 'Hello World' },
          timestamp: Date.now()
        }
      }, '*');
    });
    
    // Wait for permission dialog
    await page.waitForSelector('text=Permission Required');
    
    // Click Allow
    await page.click('button:has-text("Allow")');
    
    // Verify dialog is closed
    await expect(page.locator('text=Permission Required')).not.toBeVisible();
  });

  test('should handle deny permission response', async ({ page }) => {
    await navigateToApp(page);
    
    // Inject a mock permission request
    await page.evaluate(() => {
      window.postMessage({
        type: 'permission:request',
        data: {
          id: 'test-request-3',
          sessionId: 'test-session-3',
          toolName: 'Delete',
          input: { path: '/important/file.txt' },
          timestamp: Date.now()
        }
      }, '*');
    });
    
    // Wait for permission dialog
    await page.waitForSelector('text=Permission Required');
    
    // Click Deny
    await page.click('button:has-text("Deny")');
    
    // Verify dialog is closed
    await expect(page.locator('text=Permission Required')).not.toBeVisible();
  });

  test('should show high risk warning for dangerous tools', async ({ page }) => {
    await navigateToApp(page);
    
    // Inject a mock permission request for a dangerous tool
    await page.evaluate(() => {
      window.postMessage({
        type: 'permission:request',
        data: {
          id: 'test-request-4',
          sessionId: 'test-session-4',
          toolName: 'Bash',
          input: { command: 'rm -rf /', description: 'Delete everything' },
          timestamp: Date.now()
        }
      }, '*');
    });
    
    // Wait for permission dialog
    await page.waitForSelector('text=Permission Required');
    
    // Check for high risk warning
    await expect(page.locator('text=High Risk Action')).toBeVisible();
    await expect(page.locator('text=This action could modify your system')).toBeVisible();
  });

  test('should allow editing permission request input', async ({ page }) => {
    await navigateToApp(page);
    
    // Inject a mock permission request
    await page.evaluate(() => {
      window.postMessage({
        type: 'permission:request',
        data: {
          id: 'test-request-5',
          sessionId: 'test-session-5',
          toolName: 'Write',
          input: { file_path: '/tmp/test.txt', content: 'Original content' },
          timestamp: Date.now()
        }
      }, '*');
    });
    
    // Wait for permission dialog
    await page.waitForSelector('text=Permission Required');
    
    // Click Edit button
    await page.click('button:has-text("Edit")');
    
    // Check that textarea is visible
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    
    // Verify original content is shown
    const content = await textarea.inputValue();
    expect(content).toContain('Original content');
    
    // Edit the content
    await textarea.fill(JSON.stringify({ 
      file_path: '/tmp/test.txt', 
      content: 'Modified content' 
    }, null, 2));
    
    // Click Allow
    await page.click('button:has-text("Allow")');
    
    // Verify dialog is closed
    await expect(page.locator('text=Permission Required')).not.toBeVisible();
  });

  test('should save default permission mode in settings', async ({ page }) => {
    await navigateToApp(page);
    
    // Open settings
    await page.click('[data-testid="settings-button"]');
    
    // Select approve mode
    await page.click('input[name="defaultPermissionMode"][value="approve"]');
    
    // Save settings
    await page.click('button:has-text("Save")');
    
    // Wait for settings to close
    await page.waitForSelector('text=Settings', { state: 'hidden' });
    
    // Re-open settings to verify it was saved
    await page.click('[data-testid="settings-button"]');
    
    // Check that approve mode is selected
    await expect(page.locator('input[name="defaultPermissionMode"][value="approve"]')).toBeChecked();
  });
});