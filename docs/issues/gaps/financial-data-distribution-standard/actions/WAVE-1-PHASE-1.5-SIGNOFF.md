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
| Shared-database mutation risk recorded | pass | Preview and production both point to Supabase project `vaicxfihdldgepzryhpd`. See shared-database caveat below. |
| Preview validation declared read-only against shared DB | pass | No mutation actions performed during Gate 0 verification. All checks were read-only HTTP requests and Vercel API metadata queries. |

**Gate 0 result:** PARTIAL PASS — items 1–3, 6–9 verified automatically. Items 4–5 (authentication succeeds, financial routes return data) require human sign-in on Preview URL; confirmation deferred to Gate 1 human-approval. Gate 1 approval covers and supersedes these items.

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
| Shared-database caveat recorded | pass | vaicxfihdldgepzryhpd shared between Preview and production |

**Shared-database caveat:** Preview and production both point to Supabase project `vaicxfihdldgepzryhpd`.
No validation writes may be performed during Gate 0 through Gate 3. Any attempted write would affect
the live remote database and invalidates Phase 1.5 until staging isolation exists or the FIB is amended.

**Read-only validation rule:** Because Preview and production share `vaicxfihdldgepzryhpd`,
Gate 0 through Gate 3 must not perform production data mutations. If a required validation step
would mutate data, Phase 1.5 halts until staging isolation exists or the FIB is amended.

**Gate 1 result:** PENDING HUMAN APPROVAL
**PR Preview URL:** https://pt-2-jwigzuirz-vladimirivanovdev-4624s-projects.vercel.app

**Gate 1 confirmation required:** Sign in on the Preview URL above with a pit_boss or floor_supervisor account and confirm:
1. Authentication succeeds (completes Gate 0.4)
2. At least one financial surface loads data (completes Gate 0.5)
3. Approve Gate 1 to unblock Phase 2 (WS2: Blocking and Advisory Validation)

---

## Gate 2: Validation

{WS2 fills this section}

---

## Gate 3: Operator Sign-off

{WS3 fills this section}

---

## Gate 4: Production Release and Smoke Check

{WS4 fills this section}

---

## Wave 1 Retrospective

{WS5 fills this section}
