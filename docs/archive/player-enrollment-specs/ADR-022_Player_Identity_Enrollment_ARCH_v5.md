---
id: ADR-022
title: Player Identity & Enrollment Architecture (Casino-Scoped, Least-Privilege)
version: 5.0
owner: Architecture
status: Accepted
date: 2025-12-22
deciders: Lead Architect
affects: [PlayerService, CasinoService, FinanceService, MTLService, SEC-001, COMP-002, ADR-015, ADR-018]
last_review: 2025-12-23
---

# ADR-022: Player Identity & Enrollment Architecture (Casino-Scoped, Least-Privilege)

**Status:** Accepted
**Date:** 2025-12-22
**Deciders:** Lead Architect
**Affects:** PlayerService, CasinoService (enrollment), FinanceService, MTLService, SEC-001, COMP-002, ADR-015, ADR-018

---

## Context

Floor supervisors must enroll patrons into the player's club / tracking system. Enrollment requires capturing government ID details (regulatory) and supporting compliance workflows (CTR). The existing `player` record is intentionally minimal and cannot safely hold sensitive identity attributes.

Key realities:

- **Enrollment is casino-specific.** Patrons can enroll at multiple casinos; verification workflows and policies can differ by property.
- **Tax ID (SSN/TIN) is optional at enrollment** but becomes required once compliance thresholds are met.
- **Postgres RLS is row-level**; it does not provide true column-level security. Any design that "lets pit read identity but not SSN" must enforce separation structurally.
- **Hybrid RLS + pooling model is canonical** (session vars via `set_rls_context`, JWT fallback). Anything SECURITY DEFINER must be explicitly hardened (ADR-018).

---

## Decision

### D1. Identity scope is casino-scoped enrollment (not global)

Identity verification is a property of a patron's enrollment **at a casino**, not a single global identity record.

**Result:** Identity storage is keyed and authorized by `casino_id`.

### D2. Split identity into two tables: identity vs tax identity

To enforce least privilege without pretending RLS is column security:

- `player_identity` — non-tax PII (ID doc, address, descriptors, verification metadata)
- `player_tax_identity` — tax identifiers only (SSN/TIN), ultra-restricted access

### D3. Threshold enforcement stays in Finance/MTL (PlayerService does not compute CTR)

Finance/MTL computes threshold state from their own ledgers and enforces transaction blocking. PlayerService only provides a **minimal contract**: "does this enrolled player have a tax ID on file?"

---

## Rationale

### Why casino-scoped identity (D1)?

Multi-property operators need independent enrollment and verification per casino. A patron verified at Casino A may have different ID documents or verification status at Casino B. Casino-scoping also aligns with the existing RLS model where all operational data is partitioned by `casino_id`.

### Why two-table separation (D2)?

PostgreSQL RLS operates at the row level only. There is no reliable column-level security mechanism. Attempts to use views or column-level grants with RLS create fragile security boundaries. Structural separation into two tables guarantees that:
- Non-compliance roles can query `player_identity` without any path to SSN/TIN data
- Tax data access is RPC-gated with mandatory audit logging
- Principle of least privilege is enforced by database design, not policy complexity

### Why Finance/MTL owns threshold enforcement (D3)?

Threshold computation requires aggregating transaction data across a gaming day. This data is owned by Finance/MTL domains. Having PlayerService compute thresholds would:
- Violate bounded context principles (PlayerService reading Finance ledgers)
- Duplicate aggregation logic
- Create coupling that complicates independent evolution

The minimal contract approach (`has_tax_id: boolean`) keeps PlayerService as a data authority while Finance/MTL remains the compliance engine.

---

## Scope

### In scope (MVP)
- Casino-scoped identity storage and access control
- Tax ID storage separation and role gating
- Minimal RPC contracts needed by Finance/MTL
- Audit requirements for tax ID reveal events

### Out of scope (explicit)
- Full CRM/marketing profile (contact preferences, promo cadences)
- ID scanner integration (post-MVP)
- "Document history" multi-doc model (allowed later, not required now)
- Jurisdiction-specific retention durations (approach defined; exact numbers can be policy-driven)

---

## Ownership and Bounded Context

**SRM alignment (normative):**
- **CasinoService owns** enrollment relationship: `player_casino` (who is enrolled where)
- **PlayerService owns** identity artifacts: `player_identity`, `player_tax_identity`
- **FinanceService / MTLService own** transaction aggregation, CTR threshold computation, and enforcement

**Rule:** No bounded context except PlayerService may directly SELECT from identity tables. Cross-context consumers must use PlayerService contracts.

---

## Security Invariants (Normative)

### INV-1 Casino context binding
All access checks derive `casino_id` from session/JWT context; caller-provided `casino_id` is never trusted in security-sensitive flows.

### INV-2 Enrollment prerequisite (no orphan identity)
Identity rows MUST NOT exist unless a matching enrollment exists in `player_casino(casino_id, player_id)`.

**Enforcement (normative):**
- `player_casino` MUST enforce a uniqueness key on `(casino_id, player_id)`.
- `player_identity(casino_id, player_id)` MUST have a foreign key referencing `player_casino(casino_id, player_id)`.
- `player_tax_identity(casino_id, player_id)` MUST have a foreign key referencing `player_casino(casino_id, player_id)`.

**Coupling note (explicit):**
This creates an intentional cross-context integrity dependency (PlayerService tables referencing CasinoService enrollment). This is acceptable here because it enforces the core invariant (“no orphan identity”) at the database boundary, and avoids trigger-based cross-context reads.

Deleting enrollment must define behavior (see Lifecycle).


### INV-3 Least privilege separation
Tax identifiers are stored only in `player_tax_identity`. Non-compliance roles never read tax storage.

### INV-4 Tax ID reveal is always audited
Every tax-id reveal emits an audit event capturing:
- actor_id
- casino_id
- player_id
- reason_code
- request_id (idempotency + correlation)

### INV-5 Key management (no client-settable key sources)
Encryption keys are never sourced from client-settable session variables (no `app.*` GUC keys).

Preferred key sources:
- Supabase Vault / pgsodium (preferred)
- app-layer encryption/decryption until Vault is ready (acceptable MVP fallback)

### INV-6 RLS UPDATE must include WITH CHECK
All UPDATE policies must include WITH CHECK mirroring USING to prevent scope mutation.

### INV-7 Identity writes are audited (not just reveals)
Create/update/deactivate operations on `player_identity` and `player_tax_identity` MUST emit audit events capturing:
- actor_id
- casino_id
- player_id
- action (create/update/deactivate)
- request_id (if available from the calling request context)

This prevents “silent mutation” even when full values are not readable by most roles.

---

## Data Classification

- **Tax identity (SSN/TIN):** highest sensitivity; reveal-only path with audit required.
- **Identity PII:** sensitive but operationally needed for enrollment and verification.
- **Derived attributes:** `has_tax_id` is still sensitive (compliance status). Limit who can query it.

---

## Access Control Matrix (Actor Roles)

| Role | player_identity Read | player_identity Write | player_tax_identity Read | player_tax_identity Write |
|------|----------------------|-----------------------|--------------------------|---------------------------|
| `pit_boss` | ✅ (non-tax PII only) | ✅ (limited: enrollment/supporting fields only) | ❌ | ❌ |
| `cashier` | ✅ (read-only; non-tax PII only) | ❌ | ❌ | ❌ |
| `compliance` | ✅ | ✅ (verify/update) | ✅ (**RPC only**) | ✅ (**RPC only**) |
| `admin` | ✅ | ✅ | ✅ (**RPC only**) | ✅ (**RPC only**) |
| `dealer` | ❌ | ❌ | ❌ | ❌ |

**Role model alignment (normative):**
- `compliance` MUST exist as a real `staff_role` enum value in the canonical schema **before** this ADR is implementable.
- If `compliance` does not exist yet, implementation MUST (a) add it via migration, or (b) temporarily restrict compliance-only actions to `admin` **and** explicitly track that as a security debt item.

**Meaning of “RPC only” (normative):**
- `player_tax_identity` has **no direct table privileges** (no SELECT/INSERT/UPDATE/DELETE) for any non-service role.
- All reads/writes of tax identity occur through **hardened** `SECURITY DEFINER` RPCs that implement role checks, auditing, and idempotency (see Contracts + ADR-018).

---

## Contracts (Prose, No DDL)

### C1. Minimal compliance query (boolean)
**Function:** `player_has_tax_id_on_file(player_id uuid)`

**Returns:**
- For `pit_boss` / `cashier`: `{ has_tax_id: boolean }`
- For `compliance` / `admin`: `{ has_tax_id: boolean, last4?: text }`

**Rules (normative):**
- Casino is derived from caller context (INV-1). Caller MUST NOT provide `casino_id`.
- Caller role must be one of: `pit_boss`, `cashier`, `compliance`, `admin`.
- No full SSN/TIN is ever returned.
- `last4` MUST be sourced from a dedicated stored field (see “Tax last4 storage rule” below). It MUST NOT be derived by decrypting the full tax identifier at read time.

**Tax last4 storage rule (normative):**
- `player_tax_identity` MUST store a `tax_last4` field (text, exactly 4 digits) written server-side at insert/update time.
- `tax_last4` is considered sensitive metadata; it is returned only to `compliance`/`admin`.


### C2. Tax ID reveal (audited, compliance/admin only)
**Function:** `reveal_tax_id(player_id uuid, reason_code text, request_id uuid)`

**Returns:** `{ ssn: text }` (or structured error)

**Rules (normative):**
- Casino is derived from caller context (INV-1). Caller MUST NOT provide `casino_id`.
- Caller role must be `compliance` or `admin`.
- MUST write an audit event (INV-4) **within the same transaction** as the reveal.
- MUST validate `reason_code` against an allow-list owned by compliance policy (COMP-002).
- Idempotency MUST be enforced with an explicit uniqueness key:

  **Required uniqueness key (normative):**
  - `audit_log` MUST include `(casino_id, actor_id, action, request_id)` (or equivalent stable columns).
  - A UNIQUE constraint MUST exist over those columns for `action = 'tax_id_reveal'` (or the equivalent event type).

- If the same `(request_id, actor_id)` is repeated, the function MUST return the same response and MUST NOT create duplicate audit entries.

### C3. Attach / update tax identity (audited, compliance/admin only)
**Function:** `upsert_tax_identity(player_id uuid, ssn text, source text, request_id uuid)`

**Returns:** `{ has_tax_id: boolean, last4: text }` (or structured error)

**Rules (normative):**
- This function exists because `player_tax_identity` is **RPC-only** (no direct table privileges).
- Casino is derived from caller context (INV-1). Caller MUST NOT provide `casino_id`.
- Caller role must be `compliance` or `admin`.
- MUST write an audit event for create/update operations (not only reveals).
- MUST set/update `tax_last4` server-side.
- Idempotency MUST be enforced at least for “create” via a uniqueness key on `(casino_id, player_id)` and a request-level idempotency key on `(casino_id, actor_id, action, request_id)` for the audit event (same pattern as C2).


---

## Enrollment Flow (Normative)

This ADR defines the required sequencing to avoid partial / orphan identity states.

1) **Create patron** (`player`)
- Created in PlayerService (or orchestrated by CasinoService if your UI flow prefers a single call).

2) **Create enrollment** (`player_casino`)
- Created in CasinoService.
- Establishes the `(casino_id, player_id)` enrollment key required by INV-2.

3) **Upsert non-tax identity** (`player_identity`)
- Created/updated in PlayerService.
- MUST fail if enrollment does not exist (FK enforcement per INV-2).

4) **Optional: attach tax identity** (`player_tax_identity`)
- Only via RPC (C3), `compliance`/`admin` only.

**Atomicity (recommended):**
- If you want “single-click enrollment” UX, provide an orchestrator RPC that creates steps (1) + (2) in one transaction, then let step (3) happen immediately after.
- Do **not** create identity first and “hope enrollment arrives later.” That is how you get trash states.

---

## SECURITY DEFINER RPC Hardening (Normative)

All RPCs that touch `player_tax_identity` (and any RPC that bypasses RLS) MUST comply with ADR-018, and at minimum:

- MUST set a safe `search_path` inside the function.
- MUST derive `casino_id` and `actor_id` from trusted context (session vars/JWT), never from parameters.
- MUST enforce role checks explicitly (`compliance`/`admin`), and fail closed.
- MUST write required audit events inside the same transaction.
- MUST avoid dynamic SQL unless strictly necessary.
- MUST not rely on client-controlled session variables for keys or key sources (INV-5).

---

## Uniqueness and Idempotency Keys (Normative)

Minimum required constraints to make the contracts real:

- `player_casino`: UNIQUE `(casino_id, player_id)`  
- `player_identity`: UNIQUE `(casino_id, player_id)`  
- `player_tax_identity`: UNIQUE `(casino_id, player_id)`  
- `audit_log` (or equivalent): UNIQUE `(casino_id, actor_id, action, request_id)` for idempotent security/audit events

(Exact constraint names live in migrations; these keys are the contract.)

---

## CTR Threshold Enforcement (Finance/MTL)

### Enforcement point (normative)
**Finance/MTL** must enforce "tax id required past CTR threshold" at the point of recording/approving a financial event that contributes to the gaming-day aggregate (e.g., `rpc_create_financial_txn`, MTL entry creation, or the service-layer equivalent).

### Enforcement flow (normative)
1. Finance/MTL computes gaming-day aggregate for the player (its own data).
2. If threshold met/approaching (per `casino_settings.ctr_threshold`, see COMP-002 §CTR Threshold):
   - Call PlayerService contract `player_has_tax_id_on_file(player_id)`.
3. If `has_tax_id = false`:
   - Reject with error code: `COMPLIANCE_TAX_ID_REQUIRED`
   - Include metadata: `{ threshold: casino_settings.ctr_threshold, gaming_day, casino_id, player_id }`
4. Log enforcement outcome (Finance/MTL domain logging).

**PlayerService MUST NOT compute thresholds.** PlayerService is a data authority, not the compliance engine.

---

## Lifecycle and Retention (Normative)

### Deactivation model
- Identity is enrollment-scoped. When `player_casino` is deactivated/closed, identity MUST become inaccessible to non-compliance roles.
- Prefer **soft-deactivation** over hard deletes for traceability.

**Required columns (minimum):**
- `player_identity`: `is_active boolean default true`, `deactivated_at timestamptz`, `deactivated_by uuid`, `deactivation_reason text`
- `player_tax_identity`: same pattern (`is_active`, `deactivated_at`, `deactivated_by`, `deactivation_reason`)

(If you already have a canonical `status` enum pattern, use it consistently—this list is the minimum.)

### Retention
- Retention duration is a compliance policy input (COMP-002). This ADR defines access behavior, not the exact time window.
- After deactivation:
  - `pit_boss` / `cashier`: **no access** to inactive identity rows.
  - `compliance` / `admin`: access remains, subject to policy.

### Deletion
- Hard deletes are not assumed.
- If policy later permits purge, it MUST be performed by an admin-only mechanism with an audit trail, and MUST not break referential integrity for historical Finance/MTL records.

---

## Alternatives Considered

1. **Put everything on `player`**
   - Rejected: access blast radius becomes huge; RLS cannot prevent SSN leakage by column.
2. **Single table with SSN columns + views**
   - Rejected: still too easy to misgrant privileges; split tables is clearer and safer.
3. **JSONB PII blob**
   - Rejected: weak type guarantees, encourages dumping ground behavior, harder to secure and validate.

---

## Consequences

### Positive
- Structural least-privilege (no fake column-level promises)
- Casino-scoped modeling aligns with multi-tenant RLS reality
- Clear bounded-context boundary: Finance/MTL computes thresholds; PlayerService answers identity questions
- Auditable SSN reveal workflow

### Negative / Tradeoffs
- Two-table complexity is intentional (security cost)
- Requires explicit contract calls for cross-context flows
- Vault/pgsodium integration becomes a planned dependency (or app-layer fallback for MVP)

---

## Implementation Artifacts (Normative location, not embedded here)

- Migrations:
  - `supabase/migrations/*_player_identity.sql`
  - `supabase/migrations/*_player_tax_identity.sql`
- RPCs (if implemented in DB):
  - `supabase/migrations/*_player_identity_rpcs.sql`
- Policy docs:
  - `SEC-001` (RLS matrix)
  - `ADR-018` (SECURITY DEFINER governance)

---

## Acceptance Criteria

- [ ] Identity is casino-scoped and tied to enrollment (INV-2)
- [ ] Tax identity is structurally separated; reveal and writes are audited (INV-3, INV-4, INV-7)
- [ ] `compliance` exists as a canonical `staff_role` (Role model alignment)
- [ ] `player_tax_identity` has no direct table privileges; access is RPC-only and hardened (Access Matrix, ADR-018)
- [ ] No client-settable session vars hold encryption keys (INV-5)
- [ ] Finance/MTL enforces threshold and consumes only the minimal contract (D3)
- [ ] Dealer cannot query tax-id status (Access Matrix)
- [ ] ADR contains no authoritative DDL (migrations are normative)

---

## References


### Internal Documentation
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — Bounded context ownership (PlayerService section)
- `docs/30-security/SEC-001-rls-policy-matrix.md` — RLS policy templates and patterns
- `docs/30-security/compliance/COMP-002-mtl-compliance-standard.md` — CTR thresholds and compliance requirements
- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` — Pattern C (Hybrid) RLS context injection
- `docs/80-adrs/ADR-018-security-definer-governance.md` — SECURITY DEFINER function governance

### Regulatory Context
- 31 CFR 103.22 — Currency transaction reporting by casinos
- 31 CFR 103.21 — Customer identification programs
- FinCEN Form 8362 — Currency Transaction Report by Casinos
