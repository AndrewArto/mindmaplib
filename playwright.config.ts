import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './demo/tests/browser',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command:
      'pnpm --filter @mindmaplib/core build && pnpm --filter @mindmaplib/react build && pnpm --filter @mindmaplib/demo dev --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
