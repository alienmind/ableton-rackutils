import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests. These exist because a fully green jsdom suite shipped
 * two bugs that only appear in a real browser (SCHEMA.md Q12,
 * doc/DEVELOPERS.md): the XML declaration was emitted twice, so every edit
 * threw, and HTML5 drag-and-drop silently did nothing. A test suite cannot
 * falsify an assumption about the environment it is itself running in.
 *
 * Chromium only. The point is "a real browser", not cross-browser coverage,
 * and one browser download is enough of a tax on CI.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
