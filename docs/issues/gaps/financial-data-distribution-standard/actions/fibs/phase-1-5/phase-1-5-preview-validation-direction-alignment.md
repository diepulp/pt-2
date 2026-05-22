---
title: Phase 1.5 Direction Alignment — Preview Validation Surface
status: Draft Alignment Note
date: 2026-05-05
scope: Financial Telemetry Wave 1 Phase 1.5
---

# Phase 1.5 Direction Alignment — Preview Validation Surface

## 1. Updated Finding

The prior assumption was that the Vercel Preview environment was partially usable but missing Supabase credentials.

That was incomplete.

The clarified finding is:

- True Vercel Preview deployments currently fail hard because required Supabase environment variables are missing.
- Middleware returns HTTP 500 before page code runs.
- The app appeared usable because production-tagged Vercel deployment URLs can look like Preview URLs.
- The working login/data mutation path was therefore likely tested against a Production deployment, not a true PR Preview.

## 2. Implication for Phase 1.5

Phase 1.5 cannot proceed directly to operator walkthrough until a working Preview validation surface exists.

The phase is therefore not merely:

> validate → merge

It is now:

> enable validation surface → validate → merge

This does not expand Phase 1.5 into CI/CD remediation. It sharpens the existing scope.

## 3. Corrected Phase 1.5 Purpose

Phase 1.5 exists to close Wave 1 by proving that the completed financial telemetry surfaces are:

- visible in a hosted pre-merge environment
- authenticated against Supabase
- understandable to operators
- not misleading about authority, completeness, or totals
- safely merged into the hosted pre-production app after sign-off

## 4. Required Direction Adjustment

### Gate 0 — Preview Validation Surface Exists

Before any walkthrough, advisory validation, or merge decision:

- Add the missing Supabase credentials to the Vercel Preview environment.
- Redeploy or refresh the PR Preview.
- Confirm the deployment is labeled as Preview in Vercel.
- Confirm the Preview URL no longer returns middleware 500.
- Confirm Supabase auth works.
- Confirm financial routes return data.

If this fails, Phase 1.5 halts.

### Gate 1 — Validate the Correct Environment

Because production hash URLs can resemble Preview URLs, every validation record must identify the deployment type.

Validation evidence must include one of:

- Vercel deployment label showing Preview
- Vercel deployment metadata
- explicit recorded Preview URL from the PR deployment
- optional app-visible environment marker, if available

The operator walkthrough must not be performed against a Production-tagged deployment.

### Gate 2 — Existing Phase 1.5 Validation

Once Preview is confirmed functional:

- run blocking checks: lint, type-check, build
- run advisory `test:surface` and I5 truth-telling checks
- record advisory failures with explicit engineering-lead disposition
- perform operator walkthrough on the Preview URL
- confirm authority labels, completeness states, non-authoritative totals, and split displays are understandable
- merge only after sign-off
- smoke-check production after Vercel native deployment

## 5. What Does Not Change

This finding does **not** justify expanding Phase 1.5 into broader CI/CD remediation.

Still out of scope:

- staging Supabase project
- staging Vercel project
- branch protection
- deploy workflow repair
- `workflow_call` repair
- automated migration pipeline
- advisory test promotion to blocking CI
- production tag release process
- Wave 2 schema or outbox work

Those remain Wave 2 prerequisites.

## 6. Updated Risk Posture

The risk is not that Phase 1.5 lacks enterprise-grade deployment infrastructure.

The risk is that the team could validate the wrong environment and mistake Production behavior for pre-merge Preview behavior.

Therefore, the essential control is environment identity verification.

## 7. PRD / EXEC-SPEC Patch Mandate

Downstream PRD or EXEC-SPEC language should be updated to include:

```diff
+ Gate 0: Preview validation surface must be functional before Phase 1.5 validation begins.
+ True Preview deployments must authenticate with Supabase and must not return middleware 500.
+ Validation evidence must identify the deployment as Preview, not merely a hash-style Vercel URL.
+ Operator walkthrough against a Production-tagged deployment is invalid for Phase 1.5 sign-off.
```

## 8. Concise Operating Rule

For Phase 1.5:

> Do not trust the URL shape. Verify the deployment environment.

Preview must be real, working, and explicitly identified before it can serve as the Wave 1 sign-off surface.
