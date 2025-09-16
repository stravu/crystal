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
    
    // Try multiple click strategies for better CI compatibility
    try {
      // First try: Regular click
      await settingsButton.click({ force: false });
    } catch (e) {
      // Fallback: Force click if regular click fails
      console.log('Regular click failed, trying force click');
      await settingsButton.click({ force: true });
    }
    
    // Wait for any animations to start
    await page.waitForTimeout(500);
    
    // Multiple strategies to detect the modal
    // Strategy 1: Check for any role="dialog" element
    const dialogCheck = page.locator('[role="dialog"]');
    
    // Strategy 2: Check for settings-specific content
    const settingsHeaderCheck = page.locator('text=/Crystal Settings|Settings|General|Notifications/i');
    
    // Strategy 3: Check for modal backdrop
    const modalBackdrop = page.locator('.fixed.inset-0.z-50');
    
    // Use race condition - any of these appearing means success
    try {
      await Promise.race([
        dialogCheck.waitFor({ state: 'visible', timeout: 10000 }),
        settingsHeaderCheck.first().waitFor({ state: 'visible', timeout: 10000 }),
        modalBackdrop.waitFor({ state: 'visible', timeout: 10000 })
      ]);
      
      // If we get here, at least one element appeared - test passes
      console.log('Settings modal detected successfully');
    } catch (error) {
      // Take a screenshot for debugging before failing
      await page.screenshot({ path: 'test-results/settings-dialog-failure.png', fullPage: true });
      throw new Error('Settings modal did not appear after clicking settings button');
    }
  });
});