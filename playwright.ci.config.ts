import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Reduce timeout for CI
  timeout: 30 * 1000,
  expect: {
    // Reduce expect timeout for faster failures
    timeout: 5000
  },
  // Run tests in files in parallel
  fullyParallel: true,
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: true,
  // Reduce retries to save time
  retries: 1,
  // Use more workers on CI for parallel execution
  workers: 2,
  // Reporter optimized for CI
  reporter: [
    ['list'],
    ['github'],
    ['html', { open: 'never' }]
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
    timeout: 60 * 1000, // Reduce from 120s to 60s
    env: {
      DISPLAY: ':99',
      ELECTRON_DISABLE_SANDBOX: '1',
    },
  },
});