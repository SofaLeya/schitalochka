const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : undefined,
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  webServer: { command: 'python3 -m http.server 8765', url: 'http://localhost:8765/index.html', reuseExistingServer: true },
  use: {
    baseURL: 'http://localhost:8765',
    viewport: { width: 360, height: 740 },
    serviceWorkers: 'block',
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : {},
  },
});
