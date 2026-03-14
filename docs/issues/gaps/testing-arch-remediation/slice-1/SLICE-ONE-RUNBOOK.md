# Slice One — Local Verification Runbook

## Prerequisites
- Node.js (see .nvmrc)
- Local Supabase running (supabase start) — required for integration canary
- .env.test with Supabase credentials (see .env.test.example)

## Commands

### Verify everything (single command)
npm run test:verify

### Run Casino server-side unit tests (node runtime)
npm run test:slice:casino

### Run Casino integration canary
npm run test:integration:canary -- services/casino/

### Run all node-runtime unit tests
npm run test:unit:node

## What Counts as Success
- `npm run test:verify` exits 0
- Casino integration canary: 39 tests pass (contract + algorithm verification)
- Casino route boundary test: 3 tests pass (happy + error + scoping paths)

## What This Does NOT Cover
- CI execution (not yet integrated)
- Other bounded contexts beyond Casino
- E2E / Playwright tests
- Branch protection or merge blocking
- `npm test` is advisory only — runs under legacy jsdom config
