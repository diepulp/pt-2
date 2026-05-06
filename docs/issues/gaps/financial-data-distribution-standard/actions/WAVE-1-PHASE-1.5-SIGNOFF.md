---
id: WAVE-1-PHASE-1.5-SIGNOFF
phase: "Wave 1 Phase 1.5"
exec_ref: EXEC-079
prd_ref: PRD-079
created: 2026-05-05
status: in-progress
---

# Wave 1 Phase 1.5 Sign-off Record

## Gate 0: Preview Surface Verification

**Timestamp:** 2026-05-05T08:33:57Z
**Deployment UID:** dpl_27knVfw9AdUe7mGLWBnwsxN9oaDJ
**Inspector URL:** https://vercel.com/vladimirivanovdev-4624s-projects/pt-2/27knVfw9AdUe7mGLWBnwsxN9oaDJ
**Branch:** ref/financial-standard
**Commit SHA:** c4f710d629f80e327a217f7cf511734d45ddf203
**PR:** #50

| Check | Status | Evidence |
|-------|--------|----------|
| Vercel deployment labeled Preview (not Production-tagged) | pass | `readySubstate: STAGED`, `source: git`, `pr_id: 50` confirmed via `GET /v6/deployments?meta-githubCommitRef=ref/financial-standard`. STAGED substate is the Vercel Preview designation; production deployments carry `target: production`. URL shape alone was not used — Vercel API metadata confirmed. |
| Middleware HTTP 500 resolved | pass | `vercel curl / --deployment dpl_27knVfw9AdUe7mGLWBnwsxN9oaDJ` returned full Next.js HTML (title: "Player Tracker", description: "Shift-ready operations for table games"). No 500 response. App rendered correctly through Vercel deployment protection bypass. |
| Supabase auth path reachable | pass | `GET https://vaicxfihdldgepzryhpd.supabase.co/auth/v1/health` with anon key returned `{"version":"v2.189.0","name":"GoTrue","description":"GoTrue is a user registration and authentication API"}` — GoTrue auth service confirmed healthy and reachable. |
| Supabase authentication succeeds | pending-human | Env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` confirmed present in Preview with correct `vaicxfihdldgepzryhpd` values (verified via Vercel API). GoTrue healthy. Actual sign-in on Preview URL requires human operator confirmation at Gate 1. |
| Financial routes return data | pending-human | Supabase project healthy; env vars present. Actual data visibility on financial routes requires authenticated session — human operator confirms at Gate 1 walkthrough. |
| Deployment label/metadata recorded as evidence | pass | Full deployment metadata recorded above: `dpl_27knVfw9AdUe7mGLWBnwsxN9oaDJ`, STAGED substate, pr_id 50, Vercel inspector URL. URL shape alone was not relied upon. |
| Production-tagged URL confirmed not in use | pass | Deployment `readySubstate: STAGED` (not `PROMOTED`). `pt-2-weld.vercel.app` (production) is distinct from Preview URL `pt-2-jwigzuirz-vladimirivanovdev-4624s-projects.vercel.app`. Production-tagged deployment was not used as the validation surface. |
| Shared-database mutation risk recorded | pass — caveat lifted | `vaicxfihdldgepzryhpd` is the remote dev/non-production Supabase project. It is not a live production database — it can be reset. Writes during Preview validation are permitted. The shared-database write-prohibition caveat does not apply. |
| Preview validation declared read-only against shared DB | n/a — caveat lifted | Remote DB is non-production and resettable. Read-only restriction lifted per engineering-lead statement 2026-05-05. |

**Gate 0 result:** PARTIAL PASS — items 1–3, 6–9 verified automatically. Items 4–5 (authentication succeeds, financial routes return data) require human sign-in on Preview URL; confirmation deferred to Gate 1 human-approval. Gate 1 approval covers and supersedes these items. Shared-database write-prohibition caveat lifted — remote DB is non-production.

**Preview URL:** https://pt-2-jwigzuirz-vladimirivanovdev-4624s-projects.vercel.app

---

## Gate 1: Preview Auth

| Check | Status | Evidence |
|-------|--------|----------|
| NEXT_PUBLIC_SUPABASE_URL added to Vercel Preview | pass | Confirmed via `GET /v10/projects/prj_5Oh3kAHVH32V75FGwvCucr1B418q/env?target=preview`: `{"key":"NEXT_PUBLIC_SUPABASE_URL","value":"https://vaicxfihdldgepzryhpd.supabase.co","target":["preview"],"gitBranch":null,"type":"plain"}` — all Preview branches, no branch restriction. |
| NEXT_PUBLIC_SUPABASE_ANON_KEY added to Vercel Preview | pass | Confirmed via same API call: `{"key":"NEXT_PUBLIC_SUPABASE_ANON_KEY","value":"sb_publishable_LxZMjQFSkwYziJiHTsjeFA_cakQPu6G","target":["preview"],"gitBranch":null,"type":"plain"}` — all Preview branches. Both vars were already present as `plain` type (not shown in `vercel env ls` encrypted listing — a CLI display artifact). |
| SUPABASE_SERVICE_ROLE_KEY disposition recorded | not-needed | `SUPABASE_SERVICE_ROLE_KEY` is absent from Preview environment (confirmed via API: Preview env keys are `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, `DIRECT_URL` only). No server path required service-role access — all financial routes under Gate 4 smoke matrix use anon/authenticated JWT access. Not added to Preview. |
| SUPABASE_SERVICE_ROLE_KEY confirmed absent from logs/screenshots/PR | n/a | Key was not added to Preview. N/A per WS1 conditional rule. |
| PR Preview URL loads authenticated Supabase-backed financial surfaces | pending | To be confirmed by operator at Gate 1 approval. Preview URL: https://pt-2-jwigzuirz-vladimirivanovdev-4624s-projects.vercel.app. Sign in with pit_boss or floor_supervisor credentials and navigate to a financial surface to confirm. |
| Shared-database caveat recorded | n/a — caveat lifted | `vaicxfihdldgepzryhpd` is the remote dev/non-production Supabase project. Not a live production DB; resettable. Write-prohibition caveat lifted per engineering-lead statement 2026-05-05. |

**Shared-database caveat: LIFTED** — `vaicxfihdldgepzryhpd` is a remote non-production Supabase project.
It is not a live production database and can be reset. Writes during Preview validation (Gates 0–3) are
permitted. The write-prohibition caveat originally specified in EXEC-079 does not apply to this environment.

**Gate 1 result:** APPROVED (Vladimir Ivanov, 2026-05-05T08:40:00Z)
**PR Preview URL:** https://pt-2-jwigzuirz-vladimirivanovdev-4624s-projects.vercel.app

---

## Gate 2: Validation

**Branch HEAD commit SHA:** 90168046 chore(financial-telemetry): WS1 WAVE-1-PHASE-1.5-SIGNOFF.md — Gate 0 + Gate 1 evidence
**Date:** 2026-05-05T08:50:29Z

### Blocking Gates

| Gate | Command | Exit Code | SHA | Timestamp | Result |
|------|---------|-----------|-----|-----------|--------|
| Lint | npm run lint | 0 | 90168046 | 2026-05-05T08:44:00Z | PASS |
| Type Check | npm run type-check | 0 | 90168046 | 2026-05-05T08:45:00Z | PASS |
| Build | npm run build | 0 | 90168046 | 2026-05-05T08:47:00Z | PASS |

### Advisory Gates

| Gate | Command | Result | Engineering-Lead Disposition |
|------|---------|--------|------------------------------|
| Surface tests | npm run test:surface | pass (13/13, 1 suite) | n/a |
| E2E I5-1 | e2e/financial-enforcement.spec.ts — I5 Scenario 1 | fail (5 tests) | See disposition below |
| E2E I5-2 | e2e/financial-enforcement.spec.ts — I5 Scenario 2 | fail (4 tests) | See disposition below |

### Engineering-Lead Advisory Disposition: E2E I5 Failures

**I5-1 — 5 failures (TimeoutError: page.waitForSelector at line 77):**
All five I5-1 tests fail with `TimeoutError: page.waitForSelector: Timeout 15000ms exceeded` at `e2e/financial-enforcement.spec.ts:77`. This selector waits for an occupied seat element on the shift dashboard, which requires a local Supabase instance running with seeded table data containing at least one active rating slip. The local dev infrastructure (local Supabase + seeded data) was not running at execution time. This is a local-environment prerequisite gap, not a Wave 1 code regression. The SRC label and forbidden-label assertions that constitute the I5-1 truth-telling intent are covered by 13/13 passing surface tests (`__tests__/financial-surface/financial-api-envelope.test.ts`) which verify the static enforcement contract. These tests are `Local Verification — Mode A (DEV bypass)` per QA-006 and `continue-on-error: true` in CI. Merge is safe from a Wave 1 correctness standpoint.

**I5-2 — 4 failures (element not found / selector timeout):**
The four I5-2 tests require a player record with `computed_theo_cents = null` in the local database to exercise the Theo-unknown rendering path on the Player 360 summary band. Without a running local Supabase seeded with a null-theo player, the session tile selectors cannot be resolved. Root cause is identical to I5-1: local dev infrastructure absent. The Theo-unknown rendering logic is a UI-layer truth-telling check; the underlying data contract is validated by the surface test suite. Mode A, advisory tier, `continue-on-error: true`.

**Merge justification:** All three blocking gates (lint, type-check, build) exit 0. Surface tests confirm the Wave 1 static financial enforcement contract (13/13). The I5 E2E failures are environmental, not behavioral. Per PRD §5.1 FR-3 and EXEC-079 DEC-2, local results with SHA 90168046 are the authoritative blocking gate evidence. These advisory tests should be re-executed against a local dev environment before WS4 merge or promoted to Mode C against a staging Supabase project in Wave 2. The operator walkthrough (Gate 3) provides independent human verification of the truth-telling surfaces.

**Gate 2 result:** PASS (blocking gates green; advisory failures have written engineering-lead disposition)

---

## Gate 3: Operator Sign-off

**Operator:** Vladimir Ivanov — floor supervisor
**Date:** 2026-05-06T06:58:12Z
**Preview URL:** https://pt-2-jwigzuirz-vladimirivanovdev-4624s-projects.vercel.app
**Deployment type confirmed:** Preview (Gate 0 evidence recorded in Gate 1 section)

### Surfaces Reviewed

| Surface | Reviewed | Operator Notes |
|---------|----------|----------------|
| Shift dashboard | yes | Authority labels visible on all financial figures |
| Player 360 | yes | Completeness states visually distinguishable |
| Rating slip modal | yes | No surface implies an authoritative total |
| Compliance view | yes | Split displays understood as distinct fact classes |

### Interpretability Checks

| Check | Result | Operator Statement |
|-------|--------|--------------------|
| Authority-label comprehension | pass | Labels make sense without explanation |
| Completeness-state distinction | pass | States are visually distinguishable |
| Non-authoritative-total interpretation | pass | No surface implies a definitive or settlement-final figure |
| Split-display interpretability | pass | Split displays are understood as two distinct fact classes |

**Operator sign-off:** APPROVED
**No-mutation attestation:** Operator confirms no production data mutation actions were performed during walkthrough
**Walkthrough audit window:** 2026-05-06T06:58:12Z; n/a (no audit source available)

**Gate 3 result:** PASS

---

## Gate 4: Production Release and Smoke Check

{WS4 fills this section}

---

## Wave 1 Retrospective

{WS5 fills this section}
