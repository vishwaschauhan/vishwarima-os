import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the local Auth and Firestore emulators (`npm run test:e2e`).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    ...devices['iPhone 14'],
    browserName: 'chromium',
    // Optional: point at a preinstalled Chromium instead of Playwright's download.
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    env: { VITE_USE_EMULATORS: 'true' },
  },
})
