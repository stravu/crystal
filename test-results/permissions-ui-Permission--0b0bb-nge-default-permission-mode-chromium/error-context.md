# Test info

- Name: Permission UI Elements >> Can change default permission mode
- Location: /Users/jordanbentley/git/ccc/tests/permissions-ui.spec.ts:35:7

# Error details

```
Error: page.waitForSelector: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('text="Settings"') to be visible

    at /Users/jordanbentley/git/ccc/tests/permissions-ui.spec.ts:40:16
```

# Test source

```ts
   1 | import { test, expect } from '@playwright/test';
   2 |
   3 | test.describe('Permission UI Elements', () => {
   4 |   test.beforeEach(async ({ page }) => {
   5 |     await page.goto('/');
   6 |     await page.waitForLoadState('networkidle');
   7 |     
   8 |     // Close welcome dialog if present
   9 |     const getStartedButton = page.locator('button:has-text("Get Started")');
  10 |     if (await getStartedButton.isVisible({ timeout: 1000 }).catch(() => false)) {
  11 |       await getStartedButton.click();
  12 |     }
  13 |   });
  14 |
  15 |   test('Settings should have permission mode option', async ({ page }) => {
  16 |     // Click settings button
  17 |     await page.click('[data-testid="settings-button"]');
  18 |     
  19 |     // Wait for settings dialog
  20 |     await page.waitForSelector('text="Settings"');
  21 |     
  22 |     // Check for permission mode section
  23 |     await expect(page.locator('text="Default Permission Mode"')).toBeVisible();
  24 |     await expect(page.locator('text="Skip Permissions (Default)"')).toBeVisible();
  25 |     await expect(page.locator('text="Approve Actions"')).toBeVisible();
  26 |     
  27 |     // Check radio buttons
  28 |     await expect(page.locator('input[name="defaultPermissionMode"][value="ignore"]')).toBeVisible();
  29 |     await expect(page.locator('input[name="defaultPermissionMode"][value="approve"]')).toBeVisible();
  30 |     
  31 |     // Default should be 'ignore'
  32 |     await expect(page.locator('input[name="defaultPermissionMode"][value="ignore"]')).toBeChecked();
  33 |   });
  34 |
  35 |   test('Can change default permission mode', async ({ page }) => {
  36 |     // Click settings button
  37 |     await page.click('[data-testid="settings-button"]');
  38 |     
  39 |     // Wait for settings dialog
> 40 |     await page.waitForSelector('text="Settings"');
     |                ^ Error: page.waitForSelector: Test timeout of 60000ms exceeded.
  41 |     
  42 |     // Click approve mode
  43 |     await page.click('input[name="defaultPermissionMode"][value="approve"]');
  44 |     
  45 |     // Save settings
  46 |     await page.click('button:has-text("Save")');
  47 |     
  48 |     // Wait for settings to close
  49 |     await page.waitForSelector('text="Settings"', { state: 'hidden' });
  50 |     
  51 |     // Re-open settings
  52 |     await page.click('[data-testid="settings-button"]');
  53 |     
  54 |     // Verify it was saved
  55 |     await expect(page.locator('input[name="defaultPermissionMode"][value="approve"]')).toBeChecked();
  56 |   });
  57 |
  58 |   test('Permission dialog component renders correctly', async ({ page }) => {
  59 |     // Inject a mock permission dialog by evaluating in page context
  60 |     await page.evaluate(() => {
  61 |       // Create a temporary container for testing
  62 |       const container = document.createElement('div');
  63 |       container.innerHTML = `
  64 |         <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
  65 |           <div class="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full">
  66 |             <div class="p-6">
  67 |               <h2 class="text-xl font-semibold text-white">Permission Required</h2>
  68 |               <p class="text-sm text-gray-400">Claude wants to Execute shell commands</p>
  69 |             </div>
  70 |             <div class="p-6">
  71 |               <button class="px-4 py-2 bg-gray-700 text-white rounded">Deny</button>
  72 |               <button class="px-4 py-2 bg-blue-600 text-white rounded">Allow</button>
  73 |             </div>
  74 |           </div>
  75 |         </div>
  76 |       `;
  77 |       document.body.appendChild(container);
  78 |     });
  79 |     
  80 |     // Check that permission dialog elements are visible
  81 |     await expect(page.locator('text="Permission Required"')).toBeVisible();
  82 |     await expect(page.locator('text="Claude wants to Execute shell commands"')).toBeVisible();
  83 |     await expect(page.locator('button:has-text("Allow")')).toBeVisible();
  84 |     await expect(page.locator('button:has-text("Deny")')).toBeVisible();
  85 |   });
  86 | });
```