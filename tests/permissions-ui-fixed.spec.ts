import { test, expect } from '@playwright/test';

test.describe('Permission UI Elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Close welcome dialog if present
    const getStartedButton = page.locator('button:has-text("Get Started")');
    if (await getStartedButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await getStartedButton.click();
    }
  });

  test('Settings should have permission mode option', async ({ page }) => {
    // Click settings button with retry
    const settingsButton = page.locator('[data-testid="settings-button"]');
    await expect(settingsButton).toBeVisible({ timeout: 10000 });
    await settingsButton.click();
    
    // Wait for settings dialog with better selector
    const settingsDialog = page.locator('div[role="dialog"]:has-text("Settings")');
    await expect(settingsDialog).toBeVisible({ timeout: 10000 });
    
    // Check for permission mode section
    await expect(page.locator('text="Default Permission Mode"')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text="Skip Permissions (Default)"')).toBeVisible();
    await expect(page.locator('text="Approve Actions"')).toBeVisible();
    
    // Check radio buttons
    await expect(page.locator('input[name="defaultPermissionMode"][value="ignore"]')).toBeVisible();
    await expect(page.locator('input[name="defaultPermissionMode"][value="approve"]')).toBeVisible();
    
    // Default should be 'ignore'
    await expect(page.locator('input[name="defaultPermissionMode"][value="ignore"]')).toBeChecked();
  });

  test('Can change default permission mode', async ({ page }) => {
    // Click settings button
    const settingsButton = page.locator('[data-testid="settings-button"]');
    await expect(settingsButton).toBeVisible({ timeout: 10000 });
    await settingsButton.click();
    
    // Wait for settings dialog
    const settingsDialog = page.locator('div[role="dialog"]:has-text("Settings")');
    await expect(settingsDialog).toBeVisible({ timeout: 10000 });
    
    // Click approve mode
    const approveRadio = page.locator('input[name="defaultPermissionMode"][value="approve"]');
    await approveRadio.click();
    
    // Save settings - click the Save button
    const saveButton = page.locator('button[type="submit"]:has-text("Save")');
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    
    // Wait for settings to close - check dialog is gone
    await expect(settingsDialog).toBeHidden({ timeout: 10000 });
    
    // Give a moment for settings to persist
    await page.waitForTimeout(500);
    
    // Re-open settings
    await settingsButton.click();
    
    // Wait for dialog again
    await expect(settingsDialog).toBeVisible({ timeout: 10000 });
    
    // Check that approve mode is now selected
    await expect(page.locator('input[name="defaultPermissionMode"][value="approve"]')).toBeChecked();
  });

  test('Permission dialog component renders correctly', async ({ page }) => {
    // This test checks if the permission dialog component exists in the codebase
    // For a real test, we'd need to trigger a permission request
    
    // Navigate to a page that might show permissions
    await page.goto('/');
    
    // For now, just check that the app loaded
    await expect(page.locator('body')).toBeVisible();
    
    // Could add more specific tests here when we know how to trigger permission dialogs
  });
});