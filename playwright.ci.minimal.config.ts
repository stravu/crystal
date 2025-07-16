import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Only run smoke tests and health check in CI
  testMatch: ['smoke.spec.ts', 'health-check.spec.ts'],
  // Reduce timeout for CI
  timeout: 20 * 1000,
  expect: {
    // Reduce expect timeout for faster failures
    timeout: 5000
  },
  // Run tests in files in parallel
  fullyParallel: true,
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: true,
  // No retries for minimal tests
  retries: 0,
  // Use more workers for parallel execution
  workers: 2,
  // Reporter optimized for CI
  reporter: [
    ['list'],
    ['github'],
  ],
  
  use: {
    // Base URL to use in actions like await page.goto('/')
    baseURL: 'http://localhost:4521',
    // Collect trace only on failure to save time
    trace: 'retain-on-failure',
    // Take screenshot on failure
    screenshot: 'only-on-failure',
    // Reduce viewport for faster rendering
    viewport: { width: 1280, height: 720 },
    // Disable animations for faster tests
    launchOptions: {
      args: ['--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--no-sandbox'],
    },
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Disable GPU for CI
        launchOptions: {
          args: ['--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--no-sandbox'],
        },
      },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'pnpm electron-dev',
    port: 4521,
    reuseExistingServer: false,
    timeout: 45 * 1000,
    env: {
      DISPLAY: ':99',
      ELECTRON_DISABLE_SANDBOX: '1',
    },
  },
});