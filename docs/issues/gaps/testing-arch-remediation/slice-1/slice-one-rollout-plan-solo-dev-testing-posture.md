# Slice One Rollout Plan — Solo-Developer Testing Posture

**Status:** Proposed
**Date:** 2026-03-13
**Purpose:** Establish one honest, repeatable testing exemplar in a single bounded context under the solo-developer testing posture.

---

## 1. Intent

This slice does **not** attempt to remediate the entire repository test posture.

It exists to prove four things:

1. server-side tests can run in the **correct runtime**
2. one bounded context can be verified **honestly**
3. one API route can be tested for **handler contract behavior** with controlled dependencies, not shallow mock theatre
4. the resulting pattern can be reused for later bounded-context rollouts

This is a **truth-restoration slice**, not a governance-completion slice.

---

## 2. Slice Goal

Create one **trusted local verification exemplar** for the **Casino** bounded context.

The exemplar must include:

- one integration canary
- one API route handler boundary test
- truthful local test commands
- correct runtime separation for the touched tests
- minimal run instructions so the slice can be repeated without guesswork

---

## 3. Why This Slice Exists

The investigation established that the real testing defect is not simply “missing tests,” but **dishonest verification posture**:

- global `jsdom` causes wrong-runtime execution for server-side tests
- `test:ci` implies broader confidence than it actually provides
- CI does not currently execute a meaningful Jest verification step
- route-handler tests include shallow patterns that overstate confidence
- integration coverage exists in places but is not acting as a trusted quality signal

The solo-developer posture therefore narrows the first remediation target:

> **Fix the lying harness first. Prove one bounded context honestly. Defer ceremonial enforcement.**

---

## 4. Chosen Bounded Context

**Bounded context:** `Casino`

### Rationale

Casino is the right first slice because:

- the investigation identified the **setup wizard RPC integration test** as the best first canary
- it exercises meaningful business behavior rather than trivial helper logic
- it provides a reusable exemplar for later context-by-context rollout

### Canary target

`services/casino/__tests__/setup-wizard-rpc.int.test.ts`

This is the canonical Phase 1 canary for the slice.

---

## 5. Scope

### Included

- minimal Jest runtime split required to run the slice honestly
- one truthful local command taxonomy for the slice
- one Casino integration canary
- one Casino-related API route handler boundary test
- minimal documentation/runbook for local execution
- explicit local definition of what “green” means

### Excluded

- branch protection
- required status checks
- peer review workflow
- Playwright rollout
- repo-wide route-handler cleanup
- repo-wide test taxonomy cleanup beyond what this slice touches
- CI integration job
- multi-context rollout

The slice is intentionally narrow.

---

## 6. Rollout Sequence

## Step 1 — Establish truthful local command taxonomy

Create only the commands necessary for the slice.

### Target commands

- `test:unit:node` — server-side unit tests under `node` runtime
- `test:integration:canary` — integration tests with `RUN_INTEGRATION_TESTS=true`
- `test:slice:casino` — Casino-scoped server-side tests
- `test:verify` — composite: runs node + integration in sequence

**Deferred:** `test:unit:jsdom` — no jsdom config needed (0 component/hook tests exist; existing `jest.config.js` handles jsdom by default). Create when first client-side test is written.

### Requirements

- no misleading command name that implies broader coverage than it provides
- no continued use of `test:ci` as a label for a partial, silent exclusion set
- commands must map clearly to scope and runtime
- if a command is local-only, it must be treated as local-only

### Outcome

The slice gets a truthful execution surface before any result is trusted.

---

## Step 2 — Apply the smallest runtime split that restores honesty

Implement the minimum Jest configuration separation needed for this slice.

### Target structure

- `jest.node.config.js` for server-side tests (plain Jest, no `nextJest` wrapper)
- `jest.integration.config.js` for integration canaries (plain Jest, no `nextJest` wrapper)

**Cut:** `jest.jsdom.config.*` — 0 component/hook tests exist. Creating a config with zero consumers violates the Over-Engineering Guardrail (OE-AP-01). The existing `jest.config.js` already defaults to jsdom for any future client-side tests.

**Why `.js` not `.ts`:** Project tsconfig is incompatible with `ts-node`. Config files must be `.js` to avoid runtime resolution failures.

**Why no `nextJest`:** The `nextJest` wrapper performs Next.js config resolution (~2-4s cold-start penalty) which is unnecessary for server-side tests that don't need module transforms. Plain Jest configs with `moduleNameMapper` for `@/` alias and `ts-jest` transform are sufficient and faster.

### Rules

- server-side tests must no longer inherit a global `jsdom` environment
- integration tests must run under the correct runtime
- do not over-engineer the config structure beyond what this slice needs
- existing `jest.config.js` remains untouched (backward compat)

### Outcome

The harness stops lying about server/runtime behavior.

---

## Step 3 — Activate the Casino integration canary

Use the existing canary candidate:

`services/casino/__tests__/setup-wizard-rpc.int.test.ts`

### Requirements

- runs under `node`
- uses the intended local environment
- documents any required env gating such as `RUN_INTEGRATION_TESTS=true`
- does not pass due to wrong-runtime accidents

### What this canary validates

Contract surface verification: RPC type contracts, Zod schema validation, enum drift prevention, and resume-step determinism algorithm. This is honest verification of the RPC contract surface — not full database integration. The spec does not overclaim it as end-to-end business behavior.

### Outcome

One real contract seam in the Casino bounded context becomes locally trustworthy.

---

## Step 4 — Add one Casino API route handler boundary test

Pick one API route adjacent to the setup/bootstrap/setup-wizard behavior.

**Selected route:** `GET /api/v1/casino/settings`

### Selection criteria

The chosen route should:

- belong clearly to the Casino context
- sit close to the canary workflow
- represent a meaningful HTTP contract
- be important enough to justify boundary verification

### Test requirements

The boundary test must:

- construct a real request
- invoke the real route handler
- assert status code
- assert response body shape/content
- assert at least one error path
- mock `withServerAction` middleware to inject controlled RLS context
- mock `createClient` (or `next/headers`) since `cookies()` is a Server Component API unavailable in Jest

### What this tests — and what it does NOT

- **Tests**: Handler's request-in/response-out contract — given a controlled RLS context and stubbed Supabase, does the handler produce the correct status code, response shape, and error envelope?
- **Does NOT test**: Supabase query execution, RLS policy enforcement, tenant isolation. Those require integration-tier tests against a live database.

### Outcome

The repo gains one route-handler boundary test that verifies handler contract with controlled dependencies. This is explicitly not a tenant isolation test.

---

## Step 5 — Freeze new route-handler theatre

This slice does **not** require repo-wide cleanup.

It does require discipline going forward:

- no new shallow route-handler tests in touched areas
- no claiming shallow tests are meaningful API verification
- existing low-value tests may remain temporarily, but are not part of the trusted exemplar
- new Casino route tests must follow the boundary test exemplar pattern
- **test tier distinction**: boundary tests (mock middleware) verify handler contracts; integration tests (live DB) verify tenant isolation and business behavior — do not conflate the two

### Outcome

The slice stops the anti-pattern from spreading while avoiding a rewrite crusade.

---

## Step 6 — Make the slice locally repeatable

Write a minimal runbook for the slice.

### The runbook must state

- required local services
- required environment variables
- whether `RUN_INTEGRATION_TESTS=true` is needed
- any seed/bootstrap expectations
- exact commands to run the slice
- what counts as success
- what remains advisory outside the slice

### Outcome

The slice becomes repeatable instead of tribal knowledge.

---

## Step 7 — Define slice-one “green” honestly

For this slice, **green** means only the following:

- the Casino integration canary passes locally in the correct runtime
- the chosen Casino route handler boundary test passes locally in the correct runtime
- any touched server-side support tests pass in the correct runtime
- the commands used to run them are truthful about their scope

It does **not** mean:

- repo-wide safety
- CI-enforced verification
- merge-blocking confidence
- broad bounded-context conformance

### Outcome

The slice produces a truthful local signal rather than inflated confidence.

---

## 7. Deliverables

By the end of Slice One, the repository should have:

### 1. Runtime truth restored for the touched tests
Server-side Casino tests no longer run under global `jsdom` fiction.

### 2. Truthful commands
The test commands used by the slice describe their real scope.

### 3. One integration canary
`services/casino/__tests__/setup-wizard-rpc.int.test.ts`

### 4. One API route handler boundary test
`GET /api/v1/casino/settings` tested for handler request-to-response contract with controlled dependencies.

### 5. One local runbook
A short document describing:
- setup
- commands
- expectations
- limitations

### 6. One explicit posture statement
Example:

- **Casino slice:** trusted local verification
- **everything else:** mixed/advisory until restored

---

## 8. Exit Criteria

Slice One is complete when all of the following are true:

1. the chosen Casino canary passes locally in the correct runtime
2. the chosen Casino API route handler boundary test passes locally in the correct runtime
3. the commands used for the slice are truthful
4. the slice can be rerun from written instructions
5. the slice can serve as the template for the next bounded-context rollout

If those conditions are not met, the slice is not complete.

---

## 9. Non-Goals

This slice does **not** attempt to prove:

- the whole repo is correctly tested
- all bounded contexts are healthy
- CI is authoritative
- functional merge protection is ready
- route-handler debt is broadly retired

Any claim beyond the slice boundary is out of scope.

---

## 10. Immediate Follow-On After Slice One

Only after the slice is stable should the next step occur.

### Acceptable next moves

- restore one more Casino-adjacent test in the same bounded context
- widen the Casino slice slightly while preserving honesty
- add a lightweight, non-blocking CI execution for the exemplar later

### Not yet

- full enforcement
- branch protection ceremony
- repo-wide CI mandates
- multi-surface governance sprawl

The slice must earn promotion before promotion is granted.

---

## 11. Recommended First-Slice Summary

### Canonical first slice

- **Bounded context:** Casino
- **Integration canary:** `services/casino/__tests__/setup-wizard-rpc.int.test.ts`
- **Route boundary test:** `GET /api/v1/casino/settings` handler contract
- **Verification level:** trusted local verification
- **Governance level:** not yet merge-blocking
- **Purpose:** prove the harness is no longer lying and one real workflow survives contact with reality

---

## 12. Bottom Line

Slice One should be treated as a **bounded, local truth-restoration rollout**.

Its mission is simple:

> **Fix the runtime lie, establish one honest Casino exemplar, and create a reusable pattern for the next bounded context.**

That is enough discipline for a solo-developer workflow without collapsing back into enterprise ritual theatre.
