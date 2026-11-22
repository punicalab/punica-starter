import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // The tests share the data of one stand-in API
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'npm run api', url: 'http://127.0.0.1:4500/api/test/state', reuseExistingServer: !process.env.CI },
    // The production build: what users get
    { command: 'npm run build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI }
  ]
});
