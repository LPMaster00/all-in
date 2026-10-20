// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'on-first-retry' },
  retries: process.env.CI ? 1 : 0,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
});
