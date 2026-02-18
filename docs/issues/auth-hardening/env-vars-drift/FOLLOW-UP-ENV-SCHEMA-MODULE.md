---
id: FOLLOW-UP-ENV-SCHEMA-MODULE
title: "Follow-up: Centralized Env Validation Module + CI Template Matcher"
status: open
priority: P3
created: 2026-02-18
source: IMPL-PLAN-HASENVVARS-MIDDLEWARE-BYPASS
---

# Follow-up: Centralized Env Validation Module + CI Template Matcher

## Context

The hasEnvVars middleware bypass fix (P0) eliminated the immediate security gap. However, the
codebase still has 40+ scattered `process.env` access points with no centralized validation.
This creates ongoing drift risk — any new env var addition can silently fail if the template
files or runtime code diverge.

## Scope

### 1. Centralized env schema (`lib/env/`)

- Zod schema defining all required env vars with server/client split
- Single import point: `import { env } from '@/lib/env'`
- Validates at app startup (not per-request)
- Clear error messages with var name + expected shape

### 2. CI template matcher

- CI step that validates `.env.example` and `.env.test.example` keys match the Zod schema
- Fails PR if templates drift from schema

### 3. Ban raw `process.env` outside env module

- ESLint rule (`no-restricted-syntax` or custom) to forbid `process.env.*` outside `lib/env/`
- Existing usages migrated incrementally

## Definition of Done

- [ ] `lib/env/server.ts` — server-only env vars (Zod validated)
- [ ] `lib/env/client.ts` — NEXT_PUBLIC_ env vars (Zod validated)
- [ ] CI gate: template keys match schema keys
- [ ] ESLint rule banning raw `process.env` outside `lib/env/`
- [ ] Zero raw `process.env` in runtime code (outside `lib/env/`)
- [ ] `lib/supabase/service.ts` throws if `SUPABASE_SERVICE_ROLE_KEY` missing (via env module)

## Not in Scope

- Lock screen refresh persistence (separate PR)
- E2E regression test for token expiry (separate PR)
