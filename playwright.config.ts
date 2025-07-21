import { defineConfig, devices } from '@playwright/test';

// Environment-based configuration
const isCI = !!process.env.CI;
const isMinimal = process.env.PLAYWRIGHT_MINIMAL === 'true';

export default defineConfig({
  testDir: './tests',
  
  // Test selection based on environment
  testMatch: isMinimal ? ['smoke.spec.ts', 'health-check.spec.ts'] : undefined,
  
  // Timeout configuration
  timeout: isMinimal ? 20 * 1000 : isCI ? 30 * 1000 : 60 * 1000,
  
  expect: {
    timeout: isCI ? 5000 : 10000
  },
  
  fullyParallel: true,
  forbidOnly: isCI,
  
  // Retry configuration
  retries: isMinimal ? 0 : isCI ? 1 : 0,
  
  // Worker configuration
  workers: isCI ? 2 : undefined,
  
  // Reporter configuration
  reporter: isCI ? [
    ['list'],
    ['github'],
    ...(isMinimal ? [] : [['html', { open: 'never' }]])
  ] : 'list',
  
  use: {
    baseURL: 'http://localhost:4521',
    trace: isCI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    
    // CI-specific viewport and launch options
    ...(isCI && {
      viewport: { width: 1280, height: 720 },
      launchOptions: {
        args: ['--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--no-sandbox'],
      },
    }),
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // CI-specific launch options
        ...(isCI && {
          launchOptions: {
            args: ['--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--no-sandbox'],
          },
        }),
      },
    },
  ],

  webServer: {
    command: 'pnpm electron-dev',
    port: 4521,
    reuseExistingServer: !isCI,
    timeout: isMinimal ? 45 * 1000 : isCI ? 60 * 1000 : 120 * 1000,
    
    // CI-specific environment
    ...(isCI && {
      env: {
        DISPLAY: ':99',
        ELECTRON_DISABLE_SANDBOX: '1',
      },
    }),
  },
});