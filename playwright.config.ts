import { defineConfig } from '@playwright/test';

/**
 * Configuration for Playwright E2E tests for Electron app
 */
export default defineConfig({
  // Test directory
  testDir: './e2e',
  
  // Test timeout: 60 seconds per test
  timeout: 60000,
  
  // Global timeout: 10 minutes for the entire test suite
  globalTimeout: 600000,
  
  // Number of workers for parallel execution
  workers: 1, // Run tests sequentially for Electron
  
  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  
  // Retry failed tests
  retries: 0,
  
  // Use configuration
  use: {
    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video recording
    video: 'retain-on-failure',
  },
  
  // Projects configuration for different test scenarios
  projects: [
    {
      name: 'electron',
      use: {
        // Electron specific configuration will be set in the test file
      },
    },
  ],
});