import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Test Configuration
 *
 * Configured for API testing against local Next.js development server.
 * Uses environment variables for Supabase connection.
 */
export default defineConfig({
  testDir: "./e2e",

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: "html",

  // Shared settings for all the projects below
  use: {
    // Base URL for API requests
    baseURL: process.env.BASE_URL || "http://localhost:3000",

    // Collect trace when retrying the failed test
    trace: "on-first-retry",
  },

  // Configure projects for major browsers (API tests don't need multiple browsers)
  projects: [
    {
      name: "api",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
