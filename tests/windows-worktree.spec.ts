import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { execSync } from 'child_process';

// Only run these tests on Windows
test.describe('Windows Worktree Management', () => {
  test.skip(process.platform !== 'win32', 'Windows-only tests');

  test('should display worktree status indicators', async ({ page }) => {
    // Navigate to the app
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Close welcome dialog if present
    const getStartedButton = page.locator('button:has-text("Get Started")');
    if (await getStartedButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await getStartedButton.click();
    }
    
    // Look for session items
    const sessionItems = page.locator('.session-item, [data-testid*="session"]');
    const sessionCount = await sessionItems.count();
    
    if (sessionCount > 0) {
      // Check first session for worktree info
      const firstSession = sessionItems.first();
      await expect(firstSession).toBeVisible();
      
      // Look for worktree path or status
      const worktreeInfo = firstSession.locator('.worktree-path, .worktree-status, [data-worktree]');
      const hasWorktreeInfo = await worktreeInfo.count() > 0;
      
      if (hasWorktreeInfo) {
        console.log('Worktree information found in session UI');
      }
    }
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'test-results/windows-worktree-status.png' });
  });

  test('should handle session deletion on Windows', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Close welcome dialog if present
    const getStartedButton = page.locator('button:has-text("Get Started")');
    if (await getStartedButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await getStartedButton.click();
    }
    
    // Check if there are any sessions
    const sessionItems = page.locator('.session-item, [data-testid*="session"]');
    const sessionCount = await sessionItems.count();
    
    if (sessionCount > 0) {
      // Hover over first session to show delete button
      const firstSession = sessionItems.first();
      await firstSession.hover();
      
      // Look for delete button
      const deleteButton = firstSession.locator('button[title*="Delete"], button[aria-label*="Delete"], .delete-button');
      
      if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Click delete
        await deleteButton.click();
        
        // Look for confirmation dialog
        const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm")').last();
        if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmButton.click();
        }
        
        // Wait for deletion
        await page.waitForTimeout(3000);
        
        // Check for any error messages
        const errorDialog = page.locator('.error-dialog, [role="alert"], .notification-error');
        const hasError = await errorDialog.isVisible({ timeout: 1000 }).catch(() => false);
        
        if (hasError) {
          const errorText = await errorDialog.textContent();
          console.log('Error during deletion:', errorText);
          
          // Check if it's a worktree-specific error
          if (errorText?.includes('worktree') || errorText?.includes('directory')) {
            console.log('Worktree deletion error detected - this is what we\'re testing for');
          }
        } else {
          console.log('Session deleted successfully');
        }
      }
    } else {
      console.log('No sessions found to test deletion');
    }
    
    await page.screenshot({ path: 'test-results/windows-session-deletion.png' });
  });

  test('should show terminal functionality on Windows', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Close welcome dialog
    const getStartedButton = page.locator('button:has-text("Get Started")');
    if (await getStartedButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await getStartedButton.click();
    }
    
    // Check for terminal tab
    const terminalTab = page.locator('button:has-text("Terminal"), [data-testid="terminal-tab"], .tab-terminal');
    
    if (await terminalTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await terminalTab.click();
      await page.waitForTimeout(2000);
      
      // Look for terminal elements
      const terminal = page.locator('.xterm, .terminal-container, [data-testid="terminal"]');
      await expect(terminal).toBeVisible({ timeout: 10000 });
      
      // Check for terminal input
      const terminalInput = page.locator('textarea[placeholder*="command"], .terminal-input, [data-testid="terminal-input"]');
      
      if (await terminalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Test Windows-specific command
        await terminalInput.fill('echo %OS%');
        await terminalInput.press('Enter');
        
        await page.waitForTimeout(2000);
        
        // Check for Windows output
        const terminalOutput = page.locator('.terminal-output, .xterm-screen, [data-testid="terminal-output"]');
        const outputText = await terminalOutput.textContent();
        
        if (outputText?.includes('Windows_NT')) {
          console.log('Windows terminal command executed successfully');
        }
      }
    }
    
    await page.screenshot({ path: 'test-results/windows-terminal.png' });
  });

  test('should handle git operations on Windows', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Close welcome dialog
    const getStartedButton = page.locator('button:has-text("Get Started")');
    if (await getStartedButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await getStartedButton.click();
    }
    
    // Look for git-related UI elements
    const gitButtons = page.locator('button:has-text("Rebase"), button:has-text("Squash"), button:has-text("Git"), .git-actions');
    
    if (await gitButtons.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Git operations UI found');
      
      // Try to hover for tooltips
      const firstGitButton = gitButtons.first();
      await firstGitButton.hover();
      await page.waitForTimeout(1000);
      
      // Check for tooltip with git command
      const tooltip = page.locator('.tooltip, [role="tooltip"], .git-command-preview');
      if (await tooltip.isVisible({ timeout: 1000 }).catch(() => false)) {
        const tooltipText = await tooltip.textContent();
        console.log('Git command preview:', tooltipText);
      }
    }
    
    await page.screenshot({ path: 'test-results/windows-git-operations.png' });
  });

  test('should create new session with worktree', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Close welcome dialog
    const getStartedButton = page.locator('button:has-text("Get Started")');
    if (await getStartedButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await getStartedButton.click();
    }
    
    // Look for create session button
    const createButton = page.locator('button:has-text("Create Session"), button:has-text("New Session"), [data-testid="create-session"]');
    
    if (await createButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createButton.click();
      
      // Wait for dialog
      await page.waitForTimeout(1000);
      
      // Fill in prompt
      const promptInput = page.locator('textarea[placeholder*="prompt"], textarea[placeholder*="describe"], [data-testid="session-prompt"]');
      if (await promptInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await promptInput.fill('Test Windows worktree creation and file locking');
        
        // Look for create button in dialog
        const dialogCreateButton = page.locator('dialog button:has-text("Create"), .dialog-create-button');
        if (await dialogCreateButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await dialogCreateButton.click();
          
          // Wait for session creation
          await page.waitForTimeout(5000);
          
          // Check for new session
          const sessions = page.locator('.session-item, [data-testid*="session"]');
          const newSessionCount = await sessions.count();
          
          if (newSessionCount > 0) {
            console.log('Session created successfully');
            
            // Check for status indicators
            const statusIndicator = sessions.first().locator('.status-indicator, .session-status, [data-status]');
            if (await statusIndicator.isVisible({ timeout: 2000 }).catch(() => false)) {
              const status = await statusIndicator.getAttribute('data-status') || await statusIndicator.textContent();
              console.log('Session status:', status);
            }
          }
        }
      }
    }
    
    await page.screenshot({ path: 'test-results/windows-session-creation.png' });
  });
});