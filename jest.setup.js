// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Load environment variables — .env.local first (developer's local Supabase),
// then .env as fallback. Matches the convention in use across the repo:
//   .env.local → local Supabase (http://127.0.0.1:54321)
//   .env       → remote/shared baseline
// override:false on both means existing process.env wins; explicit invocations
// like `SUPABASE_URL=... npm test` still override.
const path = require('path');

const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: false });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });

// Fallback Supabase env vars (used if not set in .env)
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Deprecation advisory for legacy jsdom config (Slice One)
if (!process.env.JEST_CONFIG_OVERRIDE) {
  console.warn(
    '[ADVISORY] Running under legacy jsdom config. For runtime-correct execution, use: test:unit:node / test:integration:canary / test:verify',
  );
}
