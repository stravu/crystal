import { test, expect, type Page } from '@playwright/test';
import { setupTestProject, cleanupTestProject } from './setup';
import path from 'path';

// Configuration constants
const TEST_CONFIG = {
  APP_URL: process.env.CRYSTAL_TEST_URL || 'http://localhost:4521',
  MAX_RETRY_ATTEMPTS: parseInt(process.env.CRYSTAL_MAX_RETRIES || '3', 10),
  BRANCH_DETECTION_TIMEOUT: parseInt(process.env.CRYSTAL_BRANCH_TIMEOUT || '2000', 10),
  RETRY_DELAY: parseInt(process.env.CRYSTAL_RETRY_DELAY || '500', 10),
  DIALOG_CLOSE_TIMEOUT: parseInt(process.env.CRYSTAL_DIALOG_TIMEOUT || '1000', 10),
} as const;

// Helper function to navigate to app with project setup
async function navigateToAppWithProject(page: Page, testProjectPath: string) {
  try {
    console.log(`Navigating to app at ${TEST_CONFIG.APP_URL}`);
    await page.goto(TEST_CONFIG.APP_URL);
    
    // Open project dialog
    try {
      await page.getByRole('button', { name: 'Select Project' }).click();
    } catch (error) {
      console.error('Failed to click Select Project button:', error);
      throw new Error('Could not open project selection dialog');
    }
    
    // Use existing test directory
    try {
      await page.getByRole('button', { name: 'Use Existing Directory' }).click();
      await page.evaluate((path) => {
        (window as any).electronAPI.selectDirectory = async () => ({ success: true, data: path });
      }, testProjectPath);
      await page.getByRole('button', { name: 'Browse...' }).click();
    } catch (error) {
      console.error('Failed to set up existing directory:', error);
      throw new Error('Could not configure test project directory');
    }
    
    // Handle main branch detection with retry
    let retries = 0;
    let branchDetectionSuccess = false;
    
    while (retries < TEST_CONFIG.MAX_RETRY_ATTEMPTS && !branchDetectionSuccess) {
      try {
        console.log(`Attempting branch detection (attempt ${retries + 1}/${TEST_CONFIG.MAX_RETRY_ATTEMPTS})`);
        await page.waitForSelector('button:has-text("Create Project")', { 
          timeout: TEST_CONFIG.BRANCH_DETECTION_TIMEOUT 
        });
        branchDetectionSuccess = true;
        console.log('Branch detection successful');
        break;
      } catch (error) {
        retries++;
        if (retries < TEST_CONFIG.MAX_RETRY_ATTEMPTS) {
          console.log(`Branch detection failed (attempt ${retries}), retrying in ${TEST_CONFIG.RETRY_DELAY}ms...`);
          await page.waitForTimeout(TEST_CONFIG.RETRY_DELAY);
        } else {
          console.error('Branch detection failed after all retries:', error);
          throw new Error(`Branch detection failed after ${TEST_CONFIG.MAX_RETRY_ATTEMPTS} attempts`);
        }
      }
    }
    
    try {
      await page.getByRole('button', { name: 'Create Project' }).click();
    } catch (error) {
      console.error('Failed to click Create Project button:', error);
      throw new Error('Could not create project');
    }
    
    // Wait for dialog to close and sessions to load
    try {
      await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
      await page.waitForTimeout(TEST_CONFIG.DIALOG_CLOSE_TIMEOUT);
      console.log('Project setup completed successfully');
    } catch (error) {
      console.error('Failed to wait for dialog close or sessions to load:', error);
      throw new Error('Project setup did not complete properly');
    }
    
  } catch (error) {
    console.error('navigateToAppWithProject failed:', error);
    throw error; // Re-throw to allow test to fail properly
  }
}

// Helper function to create a test session
async function createTestSession(page: Page, sessionName: string) {
  // Open create session dialog
  await page.getByRole('button', { name: 'Create Session' }).click();
  
  // Fill in the session details
  await page.fill('textarea[placeholder="What would you like to accomplish?"]', `Test session: ${sessionName}`);
  await page.fill('input[placeholder="e.g., feature/new-feature or session-1"]', sessionName);
  
  // Create the session
  await page.getByRole('button', { name: 'Create Session' }).last().click();
  
  // Wait for dialog to close and session to be created
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  await page.waitForTimeout(2000);
  
  // Wait for the session to appear in the list
  await page.waitForSelector(`text=${sessionName}`, { timeout: 10000 });
}

test.describe('Worktree Rename', () => {
  let testProjectPath: string;

  test.beforeEach(async ({ page }) => {
    testProjectPath = await setupTestProject();
    await navigateToAppWithProject(page, testProjectPath);
  });

  test.afterEach(async () => {
    await cleanupTestProject(testProjectPath);
  });

  test('should rename worktree through context menu', async ({ page }) => {
    // Create a test session
    const originalName = 'test-rename-session';
    const newName = 'renamed-worktree-session';
    await createTestSession(page, originalName);
    
    // Find the session in the list and right-click it
    const sessionItem = page.locator(`text=${originalName}`).first();
    await sessionItem.click({ button: 'right' });
    
    // Verify context menu appears with "Rename Worktree" option
    const renameWorktreeButton = page.getByRole('button', { name: 'Rename Worktree' });
    await expect(renameWorktreeButton).toBeVisible();
    
    // Click rename worktree
    await renameWorktreeButton.click();
    
    // Verify inline input appears with current name
    const input = page.locator('input[type="text"]').first();
    await expect(input).toBeVisible();
    await expect(input).toHaveValue(originalName);
    
    // Clear and type new name
    await input.fill(newName);
    await input.press('Enter');
    
    // Wait for the rename to complete by waiting for the new name to appear
    await expect(page.locator(`text=${newName}`).first()).toBeVisible({ timeout: 10000 });
    
    // Verify the old name is no longer visible
    await expect(page.locator(`text=${originalName}`)).not.toBeVisible();
    
    // Test persistence - reload the page
    await page.reload();
    
    // Wait for the page to load and verify the renamed session still shows the new name
    await expect(page.locator(`text=${newName}`).first()).toBeVisible({ timeout: 10000 });
  });

  test('should not show rename worktree option for archived sessions', async ({ page }) => {
    // Create a test session
    const sessionName = 'test-archive-session';
    await createTestSession(page, sessionName);
    
    // Archive the session
    const sessionItem = page.locator(`text=${sessionName}`).first();
    await sessionItem.hover();
    
    // Set up dialog handler before triggering the dialog
    page.on('dialog', dialog => dialog.accept());
    
    // Click the archive button
    const archiveButton = sessionItem.locator('button[title="Archive session"]');
    await archiveButton.click();
    await page.waitForTimeout(1000);
    
    // Navigate to archived sessions
    await page.getByRole('button', { name: 'Archived Sessions' }).click();
    await page.waitForTimeout(1000);
    
    // Right-click the archived session
    const archivedSession = page.locator(`text=${sessionName}`).first();
    await archivedSession.click({ button: 'right' });
    
    // Verify "Rename Worktree" option is NOT present
    const renameWorktreeButton = page.getByRole('button', { name: 'Rename Worktree' });
    await expect(renameWorktreeButton).not.toBeVisible();
    
    // But regular "Rename" should still be visible
    const renameButton = page.getByRole('button', { name: 'Rename' }).first();
    await expect(renameButton).toBeVisible();
  });

  test('should handle error when renaming to existing worktree name', async ({ page }) => {
    // Create two test sessions
    const session1Name = 'test-session-1';
    const session2Name = 'test-session-2';
    
    await createTestSession(page, session1Name);
    await createTestSession(page, session2Name);
    
    // Try to rename session2 to session1's name
    const session2Item = page.locator(`text=${session2Name}`).first();
    await session2Item.click({ button: 'right' });
    
    // Click rename worktree
    const renameWorktreeButton = page.getByRole('button', { name: 'Rename Worktree' });
    await renameWorktreeButton.click();
    
    // Type the existing name
    const input = page.locator('input[type="text"]').first();
    await input.fill(session1Name);
    
    // Set up dialog handler for the error alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('already exists');
      await dialog.accept();
    });
    
    await input.press('Enter');
    
    // Wait for the error handling
    await page.waitForTimeout(1000);
    
    // Verify the original name is preserved
    await expect(page.locator(`text=${session2Name}`).first()).toBeVisible();
    
    // Verify both sessions still exist with their original names
    await expect(page.locator(`text=${session1Name}`).first()).toBeVisible();
  });

  test('should not show rename worktree option for main repo sessions', async ({ page }) => {
    // The main repo session should already exist from project setup
    // Find the main repo session (it should have "(main)" indicator)
    const mainRepoSession = page.locator('text=(main)').first();
    
    // If no main repo session visible, we need to check if it exists
    const mainRepoCount = await mainRepoSession.count();
    
    // Skip this test if no main repo session is available
    test.skip(mainRepoCount === 0, 'No main repo session found');
    
    // Right-click the main repo session
    await mainRepoSession.click({ button: 'right' });
    
    // Verify "Rename Worktree" option is NOT present
    const renameWorktreeButton = page.getByRole('button', { name: 'Rename Worktree' });
    await expect(renameWorktreeButton).not.toBeVisible();
    
    // But regular "Rename" should still be visible
    const renameButton = page.getByRole('button', { name: 'Rename' }).first();
    await expect(renameButton).toBeVisible();
  });

  test('should prevent double-prefixing when renaming @feature/ to feature/', async ({ page }) => {
    // Create a test session that results in a @feature/ prefixed worktree
    const originalName = '@feature/streamline-branch-deployment';
    await createTestSession(page, originalName);
    
    // Rename it to a name without the @ prefix
    const newName = 'feature/streamline-branch-deployment';
    
    // Find the session in the list and right-click it
    const sessionItem = page.locator(`text=${originalName}`).first();
    await sessionItem.click({ button: 'right' });
    
    // Click rename worktree
    const renameWorktreeButton = page.getByRole('button', { name: 'Rename Worktree' });
    await renameWorktreeButton.click();
    
    // Enter the new name (without @ prefix)
    const input = page.locator('input[type="text"]').first();
    await input.fill(newName);
    await input.press('Enter');
    
    // Wait for the rename to complete by waiting for the new name to appear
    await expect(page.locator(`text=${newName}`).first()).toBeVisible({ timeout: 10000 });
    
    // Verify the old name is no longer visible
    await expect(page.locator(`text=${originalName}`)).not.toBeVisible();
    
    // Verify no error dialog appeared (which would indicate double prefixing issue)
    const errorDialog = page.locator('[role="dialog"]:has-text("Failed to rename worktree")');
    await expect(errorDialog).not.toBeVisible();
  });

  test('should preserve prefix when renaming to simple name', async ({ page }) => {
    // Create a test session with @feature/ prefix
    const originalName = '@feature/old-name';
    await createTestSession(page, originalName);
    
    // Rename to a simple name (should preserve prefix)
    const simpleName = 'new-name';
    const expectedName = '@feature/new-name';
    
    // Find the session and rename it
    const sessionItem = page.locator(`text=${originalName}`).first();
    await sessionItem.click({ button: 'right' });
    
    const renameWorktreeButton = page.getByRole('button', { name: 'Rename Worktree' });
    await renameWorktreeButton.click();
    
    const input = page.locator('input[type="text"]').first();
    await input.fill(simpleName);
    await input.press('Enter');
    
    // Wait for the rename to complete by waiting for the new name to appear
    await expect(page.locator(`text=${expectedName}`).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${originalName}`)).not.toBeVisible();
  });

  test('should allow changing from one prefix structure to another', async ({ page }) => {
    // Create a test session with @feature/ prefix
    const originalName = '@feature/old-name';
    await createTestSession(page, originalName);
    
    // Rename to a different prefix structure
    const newName = '@bugfix/new-name';
    
    // Find the session and rename it
    const sessionItem = page.locator(`text=${originalName}`).first();
    await sessionItem.click({ button: 'right' });
    
    const renameWorktreeButton = page.getByRole('button', { name: 'Rename Worktree' });
    await renameWorktreeButton.click();
    
    const input = page.locator('input[type="text"]').first();
    await input.fill(newName);
    await input.press('Enter');
    
    // Wait for the rename to complete by waiting for the new name to appear
    await expect(page.locator(`text=${newName}`).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${originalName}`)).not.toBeVisible();
  });

  test('should handle invalid patterns with appropriate error dialogs', async ({ page }) => {
    // Create a test session
    const originalName = 'test-session';
    await createTestSession(page, originalName);
    
    // Try to rename to an invalid pattern that would create duplicate prefixes
    const invalidName = 'feature/feature/name';
    
    // Find the session and try to rename it
    const sessionItem = page.locator(`text=${originalName}`).first();
    await sessionItem.click({ button: 'right' });
    
    const renameWorktreeButton = page.getByRole('button', { name: 'Rename Worktree' });
    await renameWorktreeButton.click();
    
    const input = page.locator('input[type="text"]').first();
    await input.fill(invalidName);
    
    // Set up dialog handler for the error alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('duplicate prefixes');
      await dialog.accept();
    });
    
    await input.press('Enter');
    
    // Wait for the error handling
    await page.waitForTimeout(1000);
    
    // Verify the original name is preserved
    await expect(page.locator(`text=${originalName}`).first()).toBeVisible();
  });
});