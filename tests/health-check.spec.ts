import { test, expect } from '@playwright/test';

test.describe('Health Check', () => {
  test('Electron app should start', async ({ page }) => {
    // Try to navigate to the app
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for any content to appear
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Check that the page has loaded
    const title = await page.title();
    expect(title).toBeTruthy();
    
    // Log some debug info
    console.log('App started successfully with title:', title);
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/health-check.png' });
  });
});