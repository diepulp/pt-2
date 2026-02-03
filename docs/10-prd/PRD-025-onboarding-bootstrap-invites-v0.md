---
prd_id: PRD-025
title: "Onboarding v0.1: Tenant Bootstrap, Staff Invites & Company Posture"
status: Proposed
version: 0.2.0
created: 2026-01-30
updated: 2026-01-30
author: Claude (lead-architect)
priority: P1
category: FEATURE/AUTH + FEATURE/ONBOARDING
bounded_contexts:
  - CasinoService (Foundational)
depends_on:
  - PRD-024 (Landing Page + Start Gateway)
  - AUTH-HARDENING v0.1 (ADR-030)
supersedes: []
tags: [onboarding, bootstrap, staff-invite, company-rls, gap-4, tenant-provisioning]
---

# PRD-025: Onboarding v0.1 — Tenant Bootstrap, Staff Invites & Company Posture

## 1) Overview

**Name:** Onboarding v0.1 — Tenant Bootstrap + Staff Invite + Company RLS Lockdown
**Summary:**

Ship the minimum onboarding flow that takes an authenticated user from "no tenant" to "usable casino with staff." This PRD covers two vertical slices: (1) a bootstrap RPC that atomically creates a casino tenant + first admin binding, and (2) an invite-based staff onboarding flow with hashed tokens. It also locks down the company table RLS posture and closes GAP-4 (casino active validation).

The **Start Gateway** (`/start` route, `setup_status` migration, middleware re-enablement, auth redirect updates) is owned by **PRD-024** (Landing Page + Start Gateway) which is already underway. This PRD depends on PRD-024 for routing infrastructure and provides the backend RPCs that the gateway routes into.

Company remains metadata-only (not a security boundary) per the COMPANY-RLS-GAP v0.1 decision.

**Companion Artifacts (vision-level inputs — synthesized here):**
- `SPEC-ONBOARDING-v0.1.md` — Technical tenant bootstrap + invite RPCs
- `SPEC-CUSTOMER-ONBOARDING-v0.1.md` — Business/ops onboarding lifecycle
- `PRD-WIZARDS-BOOTSTRAP-SETUP-v0.1.md` — Wizard A (bootstrap) + Wizard B (setup) product shape

**Related PRDs (implementation overlap avoided):**
- `PRD-024-landing-page-start-gateway-v0.md` — Owns `/start` gateway route, `setup_status` migration, middleware, auth redirects

---

## 2) Problem & Goals

### Problem

PT-2 has a complete auth infrastructure (Supabase Auth, login/signup pages, RLS context injection) but no path from "authenticated user" to "usable tenant." Users who sign up encounter a blank app shell with no casino, no staff binding, and no guided configuration. There is no mechanism to invite additional staff to a casino tenant.

Additionally, the `company` table exists in the schema with a FK to `casino`, but has zero RLS policies, no context variable (`app.company_id`), and no authorization role in the security model (GAP-COMPANY-CASINO-RLS-CONTEXT, 5 gaps identified). This PRD explicitly locks company as metadata-only and establishes the casino-scoped onboarding path.

### Goals

**G1 — Atomic tenant creation:** An authenticated user can create a casino tenant (casino + casino_settings + admin staff binding) in a single RPC call. No partial state possible.

**G2 — Invite-based staff onboarding:** An admin can create time-limited, hashed-token invites. An invited user can accept and become bound to the casino tenant via a single RPC. Tokens are single-use and never stored in plaintext.

**G3 — Company posture locked:** Company table gets RLS enabled with deny-by-default. Company is documented as metadata-only. No company-scoped authorization in v0.1.

**G4 — Casino active validation (GAP-4):** `set_rls_context_from_staff()` validates casino is active before granting context. Staff at deactivated casinos cannot derive tenant context.

### Non-Goals (explicit deferrals)

- Start Gateway route, `setup_status` migration, middleware, auth redirects — **owned by PRD-024**
- SSO/SAML/SCIM or enterprise identity federation
- Company-as-security-boundary (`company_id` in RLS context, multi-property admin)
- Multi-casino membership per user (junction tables, tenant picker)
- Subscription/billing platform (invoicing, metering, dunning)
- Wizard B — Initial Setup Wizard (floor skeleton, game defaults, promo catalog) — separate PRD
- Email delivery automation for invites (v0.1 uses "copy link" manual flow)
- Full admin console or settings platform

---

## 3) Users & Use Cases

### Primary Users

**Tenant Admin (casino admin)**
- "I need to create a new casino tenant so my team can start using PT."
- "I need to invite my pit bosses and cashiers with the correct roles."
- "I need a clear path from signup to a working app — no blank screens."

**Invited Staff (pit boss, cashier, dealer with auth)**
- "I received an invite link and need to accept it to join the casino."
- "After accepting, I should land in the app with correct permissions."

**Vendor Implementation Owner (internal)**
- "I need a repeatable tenant provisioning path that doesn't require manual DB operations."

---

## 4) Scope & Feature List

### In-scope features (v0.1)

**Tenant Bootstrap (Wizard A backend + UI)**
1. `rpc_bootstrap_casino` — SECURITY DEFINER RPC that atomically creates `casino` + `casino_settings` + first `staff` admin binding
2. Bootstrap idempotency — user with existing staff binding gets conflict error (no duplicate tenants)
3. Bootstrap UI — single-page form (casino name, timezone, gaming day start, optional legal name)
4. Post-bootstrap context validation — `set_rls_context_from_staff()` succeeds immediately after bootstrap

**Staff Invite Flow**
5. `staff_invite` table with RLS policies (admin-only CRUD, casino-scoped)
6. `rpc_create_staff_invite` — SECURITY DEFINER RPC (admin-only, creates invite with hashed token, returns raw token once)
7. `rpc_accept_staff_invite` — SECURITY DEFINER RPC (validates token, creates staff binding, marks invite accepted)
8. Invite UI — admin screen to enter email + role, displays invite link
9. Accept UI — reads token from URL, requires auth, calls accept RPC

**Company Posture Lockdown**
10. Enable RLS on `company` table with deny-by-default policies
11. Document company as metadata-only in SEC-001/SEC-002

**Casino Active Validation (GAP-4 fix)**
12. Add casino active status check to `set_rls_context_from_staff()` — staff at deactivated casinos cannot derive context

### Out of scope (owned by PRD-024)

- `/start` gateway route with server-side decision tree
- `setup_status` + `setup_completed_at` columns on `casino_settings`
- Middleware re-enablement and auth redirect updates
- Marketing landing page and CTA wiring

---

## 5) Requirements

### Functional Requirements

**FR-1: Bootstrap atomicity.** `rpc_bootstrap_casino` creates casino, casino_settings, and staff in a single transaction. If any step fails, all roll back. No partial tenant state is possible.

**FR-2: Bootstrap idempotency.** If `auth.uid()` already has an active staff binding, `rpc_bootstrap_casino` returns a typed conflict error. It does not create a second tenant.

**FR-3: Invite token security.** Invite tokens are generated server-side (cryptographically random), hashed before storage (`token_hash`), returned to the caller exactly once. Tokens expire after a configurable TTL (default: 72 hours). Tokens are single-use (second acceptance attempt fails).

**FR-4: Invite role enforcement.** Only admins can create invites. The `created_by` field must match the current actor. Role is set from the invite (not user-chosen at acceptance).

**FR-5: Invite acceptance binding.** `rpc_accept_staff_invite` creates a staff row with `casino_id` from invite, `role` from invite, `status = 'active'`, and `user_id = auth.uid()`. If a staff row already exists for that user in that casino, return conflict.

**FR-6: Company RLS lockdown.** `ALTER TABLE company ENABLE ROW LEVEL SECURITY` with no permissive policies for `authenticated` role. Only `service_role` and SECURITY DEFINER RPCs can access company data.

**FR-7: Casino active validation.** `set_rls_context_from_staff()` joins to `casino` table and validates `casino.status = 'active'`. Staff at inactive casinos get a typed error, not context.

### Non-Functional Requirements

**NFR-1:** Bootstrap RPC completes in < 500ms (p95) — it's a single transaction with 3 inserts.

**NFR-2:** All RPCs use `SET LOCAL` for context (connection-pooler safe per ADR-015).

**NFR-3:** All RPCs are `SECURITY DEFINER` with `SET search_path = pg_catalog, public` (per ADR-018 governance).

**NFR-4:** Invite token hash uses `pgcrypto` SHA-256 (or equivalent). Raw token length >= 32 bytes.

### Architecture References

- **Bounded context ownership:** CasinoService per SRM v4.11.0 (owns `casino`, `casino_settings`, `staff`, `company`)
- **RLS patterns:** ADR-015 (Pattern C hybrid), ADR-020 (Track A), ADR-024 (authoritative context), ADR-030 (write-path hardening)
- **Security model:** SEC-001 (policy matrix), SEC-002 (casino-scoped model)
- **Service patterns:** SLAD v3.2.0 (functional factories, explicit interfaces)
- **Schema types:** `types/remote/database.types.ts`

---

## 6) UX / Flow Overview

### Bootstrap Flow
1. User signs up / signs in via existing auth pages
2. User clicks "Get started" on landing page → hits `/start` (PRD-024)
3. `/start` detects no staff binding → redirects to `/app/bootstrap` (PRD-024)
4. Bootstrap wizard (this PRD): single form (casino name, timezone, gaming day start)
5. Submit → calls `rpc_bootstrap_casino`
6. Success → CTA to continue to setup or app

### Invite Flow
1. Admin navigates to staff management screen
2. Enters email + selects role → calls `rpc_create_staff_invite`
3. Receives invite link with raw token → copies/sends to invitee
4. Invitee clicks link → lands on `/app/invite/accept?token=xxx`
5. If not authenticated, redirected to signin first, then back to accept
6. Accept page calls `rpc_accept_staff_invite` → staff binding created
7. User redirected to `/start` (PRD-024) → routed to app

### Integration with PRD-024 Start Gateway
```
PRD-024 owns the routing layer:
GET /start
  ├─ Not authenticated → /signin
  ├─ Authenticated + no staff binding → /app/bootstrap  ← This PRD provides the backend
  ├─ Authenticated + staff binding + setup incomplete → /app/setup
  └─ Authenticated + staff binding + setup ready → /app

This PRD provides:
  - rpc_bootstrap_casino (called by /app/bootstrap)
  - rpc_create_staff_invite + rpc_accept_staff_invite (called by invite UI)
```

---

## 7) Data Model Changes

### New Table: `staff_invite`

```sql
CREATE TABLE staff_invite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES casino(id),
  email text NOT NULL,
  staff_role staff_role NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz NULL,
  created_by uuid NOT NULL REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique active invite per casino/email
CREATE UNIQUE INDEX idx_staff_invite_active
  ON staff_invite (casino_id, lower(email))
  WHERE accepted_at IS NULL;
```

### Altered Function: `set_rls_context_from_staff()`

Add casino active validation:
```sql
-- Add JOIN to casino table in the staff lookup:
SELECT s.id, s.casino_id, s.role::text
FROM public.staff s
JOIN public.casino c ON c.id = s.casino_id
WHERE s.id = v_staff_id
  AND s.status = 'active'
  AND c.status = 'active';  -- NEW: GAP-4 fix
```

### Company RLS Lockdown

```sql
ALTER TABLE company ENABLE ROW LEVEL SECURITY;
-- No permissive policies for authenticated role = deny-by-default
-- service_role bypasses RLS; SECURITY DEFINER RPCs access as needed
```

### Note: `setup_status` owned by PRD-024

The `setup_status` and `setup_completed_at` columns on `casino_settings` are part of PRD-024's Phase 0 migration. `rpc_bootstrap_casino` in this PRD will create `casino_settings` rows with the default `setup_status = 'not_started'` value established by that migration.

---

## 8) Dependencies & Risks

### Dependencies

| Dependency | Status | Impact |
|-----------|--------|--------|
| **PRD-024** (Landing Page + Start Gateway) | **In progress** | Owns `/start` gateway, `setup_status` migration, middleware. Bootstrap wizard route targets depend on gateway routing being live. |
| AUTH-HARDENING v0.1 (ADR-030) | Active (deploying) | Bootstrap/invite RPCs depend on hardened `set_rls_context_from_staff()` return type (TABLE) |
| Supabase Auth (signup/signin) | Implemented | Bootstrap requires `auth.uid()` present |
| CasinoService CRUD | Implemented | Existing service handles casino/staff/settings reads |
| `pgcrypto` extension | Verify enabled | Token hashing requires `digest()` or equivalent |

### Coordination with PRD-024

- **PRD-024 Phase 0** ships `setup_status` migration. This PRD's `rpc_bootstrap_casino` creates `casino_settings` rows that inherit the default value.
- **PRD-024 Phase 1B** ships `/start` gateway and `(onboarding)` placeholder routes. This PRD's UI (PR-4) populates those placeholder routes with real wizard and invite screens.
- **Sequencing:** PRD-024 Phase 0-1B should land before or in parallel with this PRD's PR-4 (UI). Schema + RPC PRs (PR-1 through PR-3) can proceed independently.

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Email delivery not available in v0.1 | Medium | Use "copy link" manual flow; email delivery is Phase 2 |
| User creates tenant then loses session | Low | Bootstrap is idempotent; `/start` gateway (PRD-024) re-routes correctly |
| Token brute-force attempts | Medium | Short TTL (72h), rate-limiting at app layer, hashed storage |
| Company table lockdown breaks existing queries | Low | Company is rarely queried; verify no existing reads depend on it |
| PRD-024 gateway not yet live when bootstrap UI ships | Medium | Bootstrap UI can function standalone (direct navigation); gateway wiring is additive |

### Open Questions

1. **Should bootstrap support seeding demo data?** Recommendation: defer to Wizard B PRD. Bootstrap creates empty tenant only.
2. **Should invite acceptance work if user already has a staff binding in another casino?** Recommendation: v0.1 allows one casino per user; return conflict if user already bound elsewhere.

---

## 9) Definition of Done

### Functionality
- [ ] `rpc_bootstrap_casino` creates casino + casino_settings + staff admin atomically; returns `{ casino_id, staff_id, staff_role }`
- [ ] `rpc_bootstrap_casino` returns typed conflict if user already has staff binding
- [ ] `staff_invite` table exists with RLS policies (admin-only, casino-scoped)
- [ ] `rpc_create_staff_invite` creates invite with hashed token; returns raw token once
- [ ] `rpc_accept_staff_invite` validates token, creates staff binding, stamps `accepted_at`
- [ ] Expired/already-accepted tokens are rejected with typed errors
- [ ] Bootstrap UI wizard creates tenant and routes to app
- [ ] Invite UI allows admin to create invite and displays link
- [ ] Accept UI processes token and completes staff binding

### Data & Integrity
- [ ] Bootstrap transaction is fully atomic (no partial casino/staff state on failure)
- [ ] Token is never stored in plaintext; only `token_hash` persisted
- [ ] Bootstrap creates `casino_settings` row with default `setup_status` (from PRD-024 migration)

### Security & Access
- [ ] Company table has RLS enabled with deny-by-default
- [ ] `set_rls_context_from_staff()` validates `casino.status = 'active'` (GAP-4 fix)
- [ ] `staff_invite` RLS: admin-only INSERT/SELECT/UPDATE within casino scope
- [ ] All new RPCs are SECURITY DEFINER with `SET search_path = pg_catalog, public`
- [ ] No client-callable RPC accepts `casino_id` or `actor_id` as user input (INV-8)

### Testing
- [ ] Unit tests: bootstrap idempotency (conflict on duplicate)
- [ ] Unit tests: invite create/accept/expire/reuse scenarios
- [ ] Integration test: full bootstrap → invite → accept → context derivation flow
- [ ] RLS test: invite scoped to casino; cross-casino read blocked
- [ ] RLS test: company table deny-by-default verified

### Operational Readiness
- [ ] Audit log entries for: tenant bootstrap, invite created, invite accepted
- [ ] `npm run db:types` regenerated after all migrations
- [ ] `npm run type-check`, `npm run lint`, `npm run test` pass in CI

---

## 10) Rollout Plan (Sequenced PRs)

**PR-1: Schema — `staff_invite` table + company RLS lockdown**
- Migration: `staff_invite` table + unique partial index
- Migration: `ALTER TABLE company ENABLE ROW LEVEL SECURITY` (deny-by-default)
- Run `npm run db:types`
- *Note:* `setup_status` migration is in PRD-024 Phase 0

**PR-2: RPC — Bootstrap + GAP-4 fix**
- Migration: `rpc_bootstrap_casino` (SECURITY DEFINER)
- Migration: amend `set_rls_context_from_staff()` to validate casino active status
- Tests for bootstrap atomicity + idempotency + casino active validation

**PR-3: RPC — Invite create + accept**
- Migration: `rpc_create_staff_invite` + `rpc_accept_staff_invite` (SECURITY DEFINER)
- Migration: `staff_invite` RLS policies
- Tests for invite lifecycle (create, accept, expire, reuse, cross-casino isolation)

**PR-4: UI — Bootstrap wizard + Invite screens + Accept screen**
- Bootstrap wizard (single-page form → `rpc_bootstrap_casino`)
- Invite management screen (email + role → `rpc_create_staff_invite` → copy link)
- Accept invite screen (token from URL → `rpc_accept_staff_invite`)
- *Depends on:* PRD-024 Phase 1B for route group and gateway wiring

Single-purpose PRs only. Each PR must pass CI independently.

### Cross-PRD Sequencing

```
PRD-024 Phase 0 (setup_status migration) ──┐
PRD-024 Phase 1B (gateway + route scaffold) ─┤
                                              ├─→ This PRD PR-4 (UI)
This PRD PR-1 (staff_invite + company RLS) ──┤
This PRD PR-2 (bootstrap RPC + GAP-4) ───────┤
This PRD PR-3 (invite RPCs + RLS) ───────────┘
```

PR-1, PR-2, and PR-3 can proceed in parallel with PRD-024. PR-4 (UI) should land after both PRD-024 Phase 1B and this PRD's PR-2/PR-3.

---

## 11) Related Documents

| Document | Purpose |
|----------|---------|
| `docs/10-prd/PRD-024-landing-page-start-gateway-v0.md` | **Owns** Start Gateway, `setup_status`, middleware, auth redirects |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Bounded context ownership (CasinoService) |
| `docs/30-security/SEC-001-rls-policy-matrix.md` | RLS policy patterns |
| `docs/30-security/SEC-002-casino-scoped-security-model.md` | Security model |
| `docs/80-adrs/ADR-024_DECISIONS.md` | Authoritative context derivation |
| `docs/80-adrs/ADR-030-auth-system-hardening.md` | Auth pipeline hardening |
| `docs/issues/gaps/GAP-COMPANY-CASINO-RLS-CONTEXT.md` | Company RLS gap analysis (5 gaps) |
| `docs/20-architecture/specs/AUTH-HARDENING-v0.1/` | Auth hardening execution spec |
| `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` | Complexity limits |

---

## 12) Architectural Notes (for exec pipeline scaffolding)

### Bounded Context: CasinoService (Foundational)

All new tables and RPCs fall within CasinoService ownership per SRM v4.11.0. No new bounded context required.

### Workstream Skeleton (for EXECUTION-SPEC generation)

```
WS1: Database Schema (staff_invite + company RLS)
  → type: database
  → bounded_context: casino-service
  → dependencies: none
  → note: setup_status migration owned by PRD-024; excluded here

WS2: RPC — Bootstrap Casino + GAP-4 Casino Active Validation
  → type: rpc
  → bounded_context: casino-service
  → dependencies: [WS1]

WS3: RPC — Staff Invite Create + Accept + RLS Policies
  → type: rpc + rls
  → bounded_context: casino-service
  → dependencies: [WS1]

WS4: UI — Bootstrap Wizard + Invite Screens + Accept Screen
  → type: ui
  → bounded_context: casino-service
  → dependencies: [WS2, WS3, PRD-024 Phase 1B]
  → note: route scaffold and gateway wiring provided by PRD-024
```

### Company Posture Decision (locked for v0.1)

Per GAP-COMPANY-CASINO-RLS-CONTEXT analysis and SPEC-ONBOARDING-v0.1 §1:
- **Decision:** Option A — Company is metadata-only, not a security boundary
- `casino_id` remains the sole RLS authorization boundary
- Company table gets RLS enabled (deny-by-default) to close GAP-3
- No `app.company_id` context variable
- **Revisit triggers:** multi-property management, company-admin role, consolidated dashboards

### Casino Active Validation (GAP-4 closure)

`set_rls_context_from_staff()` will be amended to JOIN `casino` and validate `status = 'active'`. This closes GAP-4 from the company-casino RLS gap analysis and is a prerequisite for safe onboarding (deactivated casinos must not derive context).
