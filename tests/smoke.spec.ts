import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('Application should start successfully', async ({ page }) => {
    // Navigate to the app
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for any content to appear
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Check that the page has loaded
    const title = await page.title();
    expect(title).toBe('Crystal');
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/smoke-test.png' });
  });

  test('Main UI elements should be visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Close welcome dialog if present
    const getStartedButton = page.locator('button:has-text("Get Started")');
    if (await getStartedButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await getStartedButton.click();
    }
    
    // Check for main UI elements
    // Sidebar should be visible
    const sidebar = page.locator('[data-testid="sidebar"], .sidebar, aside').first();
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    
    // Settings button should exist (even if not immediately visible)
    const settingsButton = page.locator('[data-testid="settings-button"]');
    await expect(settingsButton).toHaveCount(1);
  });

  test('Settings dialog can be opened', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Close welcome dialog if present
    const getStartedButton = page.locator('button:has-text("Get Started")');
    if (await getStartedButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await getStartedButton.click();
      // Wait for dialog to close
      await page.waitForTimeout(500);
    }
    
    // Wait for the settings button to be visible and clickable
    const settingsButton = page.locator('[data-testid="settings-button"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    
    // Click settings button
    await settingsButton.click();
    
    // Wait a moment for modal animation to start
    await page.waitForTimeout(100);
    
    // Wait for the modal to appear - check for the role="dialog" element
    // The modal should contain the tabs for General, Notifications, and Stravu
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 10000 });
    
    // Verify the settings content is visible
    // Simply check that the modal dialog is present and visible
    const modalDialog = page.locator('[role="dialog"]').first();
    await expect(modalDialog).toBeVisible({ timeout: 5000 });
    
    // As a secondary check, verify some text that should be in the settings
    // Using a more generic check that should work regardless of exact text
    const settingsIndicator = page.locator('[role="dialog"]').locator('text=/General|Theme|API|Settings/i').first();
    await expect(settingsIndicator).toBeVisible({ timeout: 5000 });
  });
});