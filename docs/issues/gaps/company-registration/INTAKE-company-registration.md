# INTAKE: Company Registration and First Property Bootstrap

**FIB:** FIB-COMPANY-REG-v0 (frozen 2026-04-01)
**Status:** Approach frozen, ready for /build pipeline
**Bounded Context:** CasinoService (Foundational)
**Owner:** Vladimir Ivanov
**Date frozen:** 2026-04-01

---

## Problem

The onboarding flow skips the first link in the domain model: **Company (purchases PT-2) -> owns Casino(s) -> configured via Bootstrap**. The bootstrap RPC silently creates a synthetic company row by copying the casino name. The result is a company entity that exists structurally (ADR-043) but carries no real business identity — `company.name` equals `casino.name`, `company.legal_name` is always NULL, and no user ever sees or controls the company record.

There are no production tenants. The fix is forward-only: stop creating synthetic companies and make registration explicit.

---

## Chosen Approach

**Approach 1: `onboarding_registration` table with database-derived pre-bootstrap state.**

Evaluated against two alternatives (see `approaches.md` for full trade-off analysis):
- Approach 2 (user_metadata) rejected: client-writable, violates server-authoritative posture
- Approach 3 (app_metadata via admin API) rejected: introduces JWT refresh dependency between registration and bootstrap steps

### How It Works

1. New SECURITY DEFINER RPC `rpc_register_company` creates a `company` row and an `onboarding_registration` row keyed to `auth.uid()`
2. Amended `rpc_bootstrap_casino` resolves the pending company from `onboarding_registration`, creates the casino under it, and marks the registration consumed — all in one transaction
3. Gateway routing detects registration state and routes to `/register` or `/bootstrap` accordingly

### Why This Approach

- Onboarding state is a **domain concern**, not an auth concern — belongs in a domain table, not JWT metadata
- Bootstrap resolves `company_id` server-side from DB state — no client-carried identifiers, no URL params, no JWT refresh timing
- Consistent with the project's established posture: server-authoritative derivation, no spoofable params, fail-closed on missing context (ADR-024, ADR-030)

---

## Frozen Design Decisions

These are not open for re-evaluation during PRD/ADR/EXEC-SPEC generation.

### D1: Pre-bootstrap state via `onboarding_registration` table

The registration step creates a company row and stores the `user_id -> company_id` association in a dedicated `onboarding_registration` table. Bootstrap resolves `company_id` from this table server-side.

**Not** from the staff -> casino -> company chain (doesn't exist pre-bootstrap).
**Not** from URL params (client-carried, requires re-validation).
**Not** from JWT metadata (either client-writable or requires refresh dance).

### D2: Bootstrap fails closed without pending registration

`rpc_bootstrap_casino` no longer auto-creates synthetic company rows. If no pending `onboarding_registration` row exists for `auth.uid()`, bootstrap raises an exception. No fallback. The synthetic auto-create path is removed entirely — it is not retained for backward compatibility because there are no users depending on it.

**Rollout assumption:** No external automation, deploy scripts, seed scripts, or integration tests call `rpc_bootstrap_casino` without a prior `rpc_register_company` call. Any such callers must be updated before this change lands. Grep the codebase for `rpc_bootstrap_casino` invocations and verify each has a registration precondition.

### D3: One pending registration per user

Partial unique index on `onboarding_registration(user_id) WHERE status = 'pending'`. At most one pending row per user. Consumed rows are retained as history and do not block re-registration.

### D4: Bootstrap consumes registration transactionally

`rpc_bootstrap_casino` resolves the pending registration, creates the casino under the registered company, and marks the registration row `consumed` — all within the same transaction. No partial bootstrap write should persist if the transaction fails. The `onboarding_registration` row itself may remain in `pending` state indefinitely if the user abandons after registration but before bootstrap — this is expected, not a defect. Idempotency and retry semantics for bootstrap are downstream seams (see Key Seams table).

### D5: Field requirements

- `company.name` — **required** (establishes the tenant parent)
- `company.legal_name` — **optional**, nullable at registration, editable later

Legal name improves identity quality but is not required to form the Company -> first Property relationship. Making it required would add friction at the exact moment we're fixing onboarding. The label should read "Legal company name (optional)" with helper text: "Use the registered legal entity name if known. You can add this later."

### D6: No legacy tenant remediation

No production tenants exist. No migration UX, no remediation prompts, no backfill flows. The feature only ensures all **new** registrations create an explicit company record before first-property bootstrap.

### D7: No self-serve sister property creation

This slice handles first company + first property only. A second casino under the same company is out of scope. The `onboarding_registration` table and flow are scoped to initial tenant formation, not ongoing property management.

---

## Route Chain

### Current

```
/start -> no staff? -> /bootstrap (creates synthetic company + casino) -> /start -> /setup -> /pit
```

### Target

`/start` evaluates these conditions **in order, first match wins**:

```
1. staff exists + active + setup complete  → /pit
2. staff exists + active + setup incomplete → /setup
3. staff exists + inactive                  → /signin?error=inactive
4. no staff + pending onboarding_registration (status = 'pending') → /bootstrap
5. no staff + no pending onboarding_registration                   → /register
6. no staff + consumed/expired registration + no staff binding     → /register (treat as fresh — no stale row recovery)
```

Register parent business first. Bootstrap first property second. Continue existing startup flow afterward.

**Edge case:** If a user has a company row but the `onboarding_registration` row is consumed or missing and no staff binding exists, the user re-enters at `/register`. The prior company row is orphaned but harmless — no cascade, no cleanup required. A future "add property" flow (out of scope) would address re-use of existing companies.

---

## Scope Boundaries

### In scope

- Company registration form (company name required, legal name optional)
- `rpc_register_company` SECURITY DEFINER RPC
- `onboarding_registration` table with RLS deny-by-default + SELECT policy for own row
- `rpc_bootstrap_casino` amendment (resolve from registration, fail closed, consume transactionally)
- Gateway routing amendment (`/start` detects registration state)
- Registration + bootstrap page guards
- Integration tests for the register → bootstrap chain, covering:
  - `rpc_register_company` creates `company` row + `onboarding_registration` row with `status = 'pending'`
  - `rpc_bootstrap_casino` without pending registration raises exception (fail-closed)
  - `rpc_bootstrap_casino` with pending registration creates casino under correct `company_id`
  - Pending row is marked `consumed` on successful bootstrap (single transaction)
  - Consumed row is invisible via RLS SELECT policy
  - Direct `/bootstrap` access without pending registration redirects or errors

### Explicitly out of scope (FIB section G, immutable)

- Self-serve "add sister property" flow
- Payment, billing, pricing, invoicing, subscription
- Demo request / contact-sales / sales-assist choreography
- Company settings/edit panel (FIB section J: likely next, but not this slice)
- Tax ID, billing contact, corporate address, compliance profile
- Marketing-site lead capture or CRM integration
- Changes to PRD-051 cross-property recognition behavior
- Legacy tenant remediation UI

### Assumptions

- No live tenants require correction of synthetic company records at rollout time
- The canonical domain model is Company -> Casino (1:N), with company as purchasing/legal parent
- Existing schema already contains `company(id, name, legal_name, created_at)` and `casino.company_id NOT NULL`
- Existing onboarding/dashboard flow after bootstrap remains unchanged

---

## Hardening Rules

These apply to all downstream artifacts (PRD, ADR, EXEC-SPEC, implementation):

1. `onboarding_registration` is **narrowly scoped** to pre-bootstrap company registration state — not generic workflow infrastructure
2. One row per auth user, one active pending registration at most
3. Bootstrap must consume the registration row **transactionally** — resolve, create, mark consumed in one RPC call
4. Bootstrap must **fail closed** if no pending row exists
5. No direct client passage of `company_id` at any layer
6. Synthetic auto-create path removed, not retained as fallback
7. `audit_log` shape for pre-bootstrap events is a **downstream seam**, not frozen here (see Key Seams table)

---

## Key Seams for Downstream Artifacts

The /build pipeline should address these during PRD/ADR/EXEC-SPEC generation:

| Seam | What needs deciding |
|------|-------------------|
| `onboarding_registration` RLS | Deny-by-default + one SELECT policy (`user_id = auth.uid() AND status = 'pending'`) — only pending rows visible to gateway routing. Consumed/expired rows are invisible to the client. All mutations via SECURITY DEFINER. |
| Audit log pre-bootstrap | `casino_id` and `actor_id` are nullable in `audit_log`. Decide whether registration audit carries `user_id` + `company_id` in `details` JSONB, or whether pre-bootstrap events skip audit_log entirely and rely on `onboarding_registration.created_at` as the audit trail. |
| Bootstrap RPC signature | Unchanged externally. Internal logic changes only. No new parameters. |
| Gateway query auth | `/start` page needs to read `onboarding_registration` — the SELECT policy enables this without a service client. |
| Bootstrap page guard | Must redirect to `/register` if no pending registration. Prevents direct URL bypass. |
| Service layer placement | `registerCompany()` lives in a new `services/company/` module. Company registration makes company a first-class domain entity, not a sidecar of CasinoService. SRM should be updated to register CompanyService as owner of `company` + `onboarding_registration`. CasinoService retains read-access to `company` rows via published DTO. |
| Error codes | Registration: CONFLICT for duplicate. Bootstrap: new error for missing registration (distinct from existing CONFLICT for duplicate staff binding). |
| Bootstrap idempotency | Define behavior if user retries bootstrap after a transient failure. Should the RPC be idempotent (re-resolve same pending row) or fail on consumed row? |
| Abandoned registration | Pending rows with no bootstrap follow-through. Define whether they expire (TTL) or remain inert indefinitely. |

---

## Related Documents

| Document | Relationship |
|----------|-------------|
| `docs/issues/gaps/company-registration/FIB-registration.md` | Feature Intake Brief (frozen) |
| `docs/issues/gaps/company-registration/approaches.md` | Trade-off analysis of 3 approaches |
| `docs/issues/gaps/COMPANY-ENTITY-POSTURE.md` | Current state audit |
| `docs/issues/gaps/GAP-COMPANY-ENTITY-ONBOARDING-ORPHAN.md` | Predecessor gap (RESOLVED) |
| `docs/80-adrs/ADR-043-dual-boundary-tenancy.md` | Company foundation decisions |
| `docs/10-prd/PRD-050-dual-boundary-tenancy-p1-v0.md` | Phase 1 implementation (no UI) |
| `docs/30-security/SEC-002-casino-scoped-security-model.md` | Company-as-metadata security model |
