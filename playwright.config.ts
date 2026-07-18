import { defineConfig, devices } from '@playwright/test'

// End-to-end tests that drive the built Liebe panel inside a real, dockerized
// Home Assistant instance. Bring the stack up first with `npm run e2e:ha:up`
// (or use `npm run e2e:full`). See docs/changes/0005-dockerized-ha-e2e.md.
export default defineConfig({
  testDir: './tests/e2e',
  // The suite mutates shared entity state in a single HA instance, so tests run
  // serially rather than in parallel.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: process.env.HASS_BROWSER_URL || 'http://localhost:8123',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
