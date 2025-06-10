import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Maximum time one test can run for
  timeout: 60 * 1000,
  expect: {
    // Maximum time expect() should wait for the condition to be met
    timeout: 10000
  },
  // Run tests in files in parallel
  fullyParallel: true,
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,
  // Reporter to use
  reporter: 'list',
  
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: 'http://localhost:4521',
    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
    // Take screenshot on failure
    screenshot: 'only-on-failure',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'pnpm electron-dev',
    port: 4521,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});