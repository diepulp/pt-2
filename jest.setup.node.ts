/**
 * jest.setup.node.ts — Minimal setup for node-runtime Jest configs.
 *
 * Loads .env variables and sets Supabase fallbacks.
 * Does NOT import @testing-library/jest-dom (node environment only).
 */

// Signal to jest.setup.js that a runtime-correct config is active
process.env.JEST_CONFIG_OVERRIDE = '1';

// Load environment variables (same .env file as Playwright and Next.js)
const path = require('path');

const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });

// Fallback Supabase env vars
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
