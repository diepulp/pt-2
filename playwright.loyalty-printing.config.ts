import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated config for the PRD-092 WS9 loyalty-printing write-path E2E.
 *
 * The default `playwright.config.ts` force-loads `.env.local` with
 * `override: true`, and `.env.local` points at the REMOTE project (which lacks
 * the `print_attempt` migration → PGRST202). This config is LOCAL-pointed and
 * deliberately does NOT re-load `.env.local`, so the Supabase env exported in
 * the shell (from `npx supabase status -o env`) wins. See e2e/loyalty-printing/README.md
 * for the full run recipe (loopback agent + dev server on :3100).
 */
export default defineConfig({
  testDir: './e2e/loyalty-printing',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'loyalty-printing', use: { ...devices['Desktop Chrome'] } },
  ],
});
