---
title: "PRD Stub: Loyalty & Tier Reconciliation Workflow"
doc_type: prd
product: "Casino Player Tracker (PT-2)"
version: "v0.1"
status: draft
owner: product
last_updated: 2026-02-12
related_prds:
  - "PRD-PLAYER-CSV-IMPORT"
  - "PRD-PLAYER-CSV-IMPORT-ADDENDUM"
bounded_context: "Loyalty"
scope_type: "post-onboarding admin workflow"
---

# Loyalty & Tier Reconciliation Workflow

## Summary
This PRD defines a **post-onboarding** workflow that reconciles imported (legacy) loyalty/tier attributes with PT-2’s canonical loyalty/tier model. It exists to prevent onboarding CSV imports from becoming a de facto loyalty migration system, while still enabling properties to carry forward meaningful player tier posture safely.

---

# Problem
CSV player imports may include tier, points, and other loyalty attributes. If these values are applied directly during onboarding, PT-2 must immediately answer governance questions:

- Which system is the source of truth?
- How are conflicts resolved?
- Can a player be downgraded by stale data?
- Do entitlements (matchplay/freeplay cadence) change as a result?
- How is this audited and reversed if wrong?

Applying tier/points directly at import time risks:
- issuing incorrect comps,
- staff distrust (“system is wrong”),
- and compliance/audit gaps.

---

# Goals
1. Allow casinos to **bring forward legacy tier posture** in a controlled way.
2. Provide deterministic, auditable reconciliation with explicit policies.
3. Keep onboarding CSV import lightweight by treating loyalty fields as **staged** until reconciled.
4. Support “safe MVP” policies (e.g., upgrade-only) before advanced parity rules.

# Non-Goals
- Full loyalty ledger migration (every transaction/point event)
- Automatic reconciliation without review (for MVP)
- Fuzzy identity matching (handled by import identity logic)
- Backfilling historical theo, offers, or comp decisions from legacy

---

# Users
- **Admin / Ops Manager**: validates and applies tier posture
- **Marketing / Loyalty Manager**: confirms tiers, segments, offers rules
- **Compliance (read-only)**: reviews audit trail and provenance

---

# Inputs & Data Sources

## Staged Inputs (from CSV Import)
CSV import may include any of:
- `imported_tier`
- `imported_points_balance`
- `imported_last_activity_at`
- `imported_loyalty_id` (if applicable)
- arbitrary raw fields (as metadata)

**Requirement:** import must preserve these values in either:
- a JSON metadata field (preferred for speed), OR
- `player_import_staging` / `import_rows` table (preferred for strict workflows)

## Canonical PT-2 Sources
- `player_loyalty` (current posture, if exists)
- `loyalty_ledger` (points/theo/awards events)
- game/offer rules that derive tier or entitlements (if present)

---

# High-Level Workflow

## Step 1 — Review Queue
A “Reconcile Loyalty” admin screen shows players with staged loyalty attributes not yet reconciled.

Filters:
- casino_id
- import_id
- tier conflict vs canonical
- missing canonical record

## Step 2 — Diff View
For each player:
- Identity summary (name, identifiers)
- Staged values (imported tier/points)
- Canonical values (current tier/points)
- Delta + conflict flags
- Provenance (import_id, file name, timestamp, actor)

## Step 3 — Policy Selection (MVP Defaults)
The system applies reconciliation under a chosen policy.

### MVP Policy Set
**P0: Upgrade-only tier**
- Tier may increase, never decrease.
- If canonical tier is higher than imported, keep canonical.
- If imported tier is higher, set canonical tier to imported and log provenance.

**P0: Points are staged-only (no direct write)**
- Imported points balance is not written into `loyalty_ledger`.
- It may be stored as `starting_balance` metadata for later migration tooling.
- Any customer request for points parity becomes a separate “Points Migration” feature.

Optional P1 policies (post-MVP):
- effective-date rules (ignore values older than X days)
- allow downgrade only with explicit confirmation
- tier derived from ledger with “seed” support

## Step 4 — Apply
Applying reconciliation:
- updates canonical tier posture (where allowed)
- records an audit entry
- marks staged row as reconciled
- produces an action report

## Step 5 — Rollback / Correction
Each applied action must be reversible:
- a “revert reconciliation” action restores prior tier and logs the revert.

---

# Business Rules (MVP)

## Source of Truth
- Canonical tier in PT-2 is authoritative after reconciliation.
- CSV import values are never automatically authoritative.

## Freshness Guardrail
- If staged data lacks a timestamp, treat as “unknown freshness” and require explicit user confirmation.
- If `imported_last_activity_at` exists and is older than a configured threshold (e.g., 90 days), flag as “stale”.

## Entitlements Safety
- Until reconciled, entitlements must not change based on imported tier.
- After reconciliation, entitlements may change only if tier is authoritative per policy.

---

# Data Model Notes (Non-Binding)

## Minimal required fields (either metadata or staging table)
- `import_id` (UUID)
- `row_number`
- `imported_tier`
- `imported_points_balance` (optional)
- `imported_last_activity_at` (optional)
- `reconciliation_status` (pending/applied/reverted)
- `reconciled_at`, `reconciled_by`

## Audit Logging
Every apply/revert writes to:
- `audit_log` (actor, casino_id, action type, before/after snapshot references)

---

# Security & RLS
- Only authorized staff roles may apply reconciliation (Admin/Loyalty Manager).
- RLS must enforce casino scoping for all read/write paths.
- All actions must include `casino_id` context and actor identity.

---

# UI Requirements (MVP)
1. A “Reconcile Loyalty” screen accessible post-onboarding.
2. A queue/table with counts and filters.
3. A per-player diff view with staged vs canonical.
4. Policy selection (default upgrade-only) and “Apply” button.
5. Downloadable reconciliation report.

---

# Acceptance Criteria (MVP)
1. CSV import preserves loyalty fields as staged inputs (metadata or staging table).
2. Reconciliation queue shows pending staged records.
3. Admin can apply “upgrade-only tier” policy and update canonical tier.
4. Every apply produces an audit log entry with provenance.
5. Reconciliation can be reverted with audit logging.
6. Imported points are not silently applied to ledger in MVP.

---

# Risks & Mitigations

## Risk: Staff expects imported points to match legacy immediately
Mitigation:
- UI copy: “Tier can be seeded; points require migration tooling.”
- Provide staged points visibility (read-only) to reduce confusion.

## Risk: Wrong tier changes comps/entitlements
Mitigation:
- upgrade-only default
- no automatic entitlements changes before reconciliation
- explicit apply with audit + rollback

## Risk: Scope creep into full loyalty migration
Mitigation:
- keep ledger parity out of scope
- treat all non-tier loyalty values as staged-only until a dedicated migration PRD exists

---

# Future Work (Post-MVP)
- Points migration tooling (seed starting balance, or replay transactions)
- Derived tier rules (tier computed from ledger + seed)
- Bulk apply policies per segment/import batch
- Automated “safe apply” for non-conflicting cases with review sampling
