---
id: SCAFFOLD-LTR
title: "Feature Scaffold: Loyalty & Tier Reconciliation"
owner: product / architect
status: "Draft — PAUSED (blocked on ingestion worker prerequisite)"
date: 2026-02-24
patched: 2026-02-24
patch_source: docs/00-vision/csv-import/SCAFFOLD-LOYALTY-PATCH.md
---

# Feature Scaffold: Loyalty & Tier Reconciliation

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** Loyalty & Tier Reconciliation
**Owner / driver:** product / architect
**Stakeholders (reviewers):** ops, loyalty manager, compliance
**Status:** Draft — PAUSED (blocked on ingestion worker prerequisite)
**Last updated:** 2026-02-24

---

## BLOCKER: Server-Authoritative Ingestion Prerequisite

> **This feature cannot proceed until server-authoritative CSV ingestion is in place.**

The reconciliation pipeline assumes durable, server-staged rows with normalized loyalty fields. The current CSV import uses client-side parsing (Papa Parse), which is a preview tool — not ingestion. Client-side parsing cannot be the source of truth because:

- Browser memory + long blocking parse + flaky network = random failure modes
- Cannot reliably enforce normalization + security server-side
- Batch writes and idempotency don't belong in the client

**Required prerequisite:** Server-authoritative ingestion worker per `docs/00-vision/csv-import/CSV-IMPORT-INGESTION.md`

**Split:**
- **Client (optional):** Papa Parse for preview + header mapping UI + basic row sampling
- **Server (authoritative):** Streaming parser (`csv-parse`) + deterministic normalization + batch upsert into staging tables

**Decision linkage:** Ingestion produces staged claims; reconciliation is the only path that turns claims into truth.

---

## 1) Intent (what outcome changes?)

- **User story:** As an Admin/Ops Manager, after a CSV player import that included legacy tier/points data, I need to reconcile imported tier values with PT-2's canonical loyalty model so that players carry forward the correct tier posture without silently altering entitlements or issuing incorrect comps.

- **Success looks like:** Every imported player with staged loyalty data appears in a reconciliation queue. Admin reviews staged vs. canonical tier, applies an upgrade-only policy (MVP), and the system updates canonical tier with a full audit trail and rollback capability. Zero silent tier changes.

## 2) Constraints (hard walls)

- **Security / tenancy:** Casino-scoped RLS on all reconciliation data. Only authorized staff roles (admin, loyalty manager) may apply reconciliation. Full actor identity in audit trail.
- **Domain constraints:** Upgrade-only tier policy for MVP (tier may increase, never decrease without explicit override). Imported points are staged-only — no direct ledger write. Source of truth is canonical `player_loyalty` after reconciliation.
- **Operational constraints:** Reconciliation must be idempotent (re-apply returns existing state). Every apply must be reversible (revert restores prior tier). Bulk apply for non-conflicting cases is post-MVP.
- **Data freshness:** Binary rule, not vibes:
  - If `imported_last_activity_at` **missing** → always requires explicit per-row confirmation
  - If present but **older than threshold** → marked "stale," blocks bulk apply (post-MVP), requires per-row confirmation
  - Threshold configuration: `casino_settings` (new column, MVP default: 90 days)
- **Ingestion prerequisite:** Reconciliation reads server-staged rows only. Client-parsed data is never authoritative.

## 3) Non-goals (what we refuse to do in this iteration)

- Full loyalty ledger migration (historical point events, transaction replay)
- Imported points balance direct-write to `loyalty_ledger`
- Automatic reconciliation without human review
- Fuzzy identity matching (handled by CSV import identity resolution)
- Entitlement/comp recalculation triggered by tier change
- Bulk apply policies per segment/import batch
- Derived tier rules (tier computed from ledger with seed support)
- Fuzzy tier mapping ("close enough" vendor-to-PT-2 tier matching)

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:**
  - Server-staged loyalty fields from ingestion worker (`imported_tier`, `imported_points_balance`, `imported_last_activity_at`) — accessible via PlayerImportService DTOs
  - Import batch provenance (file name, import timestamp, actor)
  - Canonical `player_loyalty` posture (current tier, current points)
  - Reconciliation policy selection (MVP: upgrade-only tier)
  - Explicit tier mapping (vendor tier label → PT-2 canonical tier enum, per batch)

- **Outputs:**
  - Reconciliation queue (pending staged records per casino/batch)
  - Per-player diff view (staged vs. canonical with conflict flags + freshness indicators)
  - Updated canonical tier in `player_loyalty` (when applied)
  - Audit log entries with provenance (apply/revert)
  - Reconciliation status per staged record (pending/applied/reverted)
  - Downloadable reconciliation report

- **Canonical contract(s):** `ReconciliationQueueItemDTO`, `ReconciliationDiffDTO`, `ApplyReconciliationInput`, `ReconciliationAuditDTO`

## 5) Options (3 options; force tradeoffs)

### Option A: Dedicated `loyalty_reconciliation` table + SECURITY DEFINER RPC (Recommended)

New table in LoyaltyService's bounded context tracking reconciliation state. Apply/revert via atomic SECURITY DEFINER RPCs following ADR-024 pattern.

```
loyalty_reconciliation:
  id, casino_id, player_id, import_batch_id, import_row_id,
  imported_tier, imported_tier_mapped,  -- raw + canonical mapping
  imported_points_balance, imported_last_activity_at,
  canonical_tier_before, canonical_tier_after,
  policy_applied, status (pending/applied/reverted),
  freshness_flag (fresh/stale/unknown),
  reconciled_at, reconciled_by, reverted_at, reverted_by
```

RPCs: `rpc_apply_tier_reconciliation`, `rpc_revert_tier_reconciliation`

- **Pros:**
  - Clean bounded context separation (LoyaltyService owns reconciliation state)
  - Full before/after provenance without polluting import tables
  - Atomic apply/revert via single RPC (consistent with PT-2 RPC patterns)
  - Supports future batch operations, policy extensions, and reporting
  - Queryable queue with proper indexes and RLS
- **Cons / risks:**
  - New table + 2 RPCs + RLS policies (migration work)
  - Join to `import_row` for provenance display
  - Need to populate reconciliation records after import completes (trigger or explicit step)
- **Cost / complexity:** Medium — 1 migration, 2 RPCs, 1 service module, queue UI
- **Security posture impact:** Casino-scoped RLS, role-gated RPCs, full audit trail — consistent with existing security model. RPCs must hard-gate by role + casino_id inside the function body (not just RLS vibes). Function must not allow cross-casino reconciliation even if caller passes foreign IDs.
- **Exit ramp:** Table schema is extensible for future policies (add columns/enums). RPC interface stable for bulk operations later.

### Option B: Extend `import_row` with reconciliation columns — REJECTED

> **This option is explicitly rejected.** Extending `import_row` feels cheap, and then you wake up three months later with import lifecycle coupled to reconciliation lifecycle, cross-context writes, security review pain, and "we'll clean it up later" lies. Option B is how bounded contexts die: slowly, while everyone nods.

### Option C: Metadata-driven reconciliation on `player_loyalty`

Extend `player_loyalty` with a `reconciliation_metadata` JSONB column capturing import provenance, before state, and reconciliation status. No new table.

```
player_loyalty (extended):
  + reconciliation_metadata jsonb  -- { status, imported_tier,
    canonical_before, policy, reconciled_at, reconciled_by,
    import_batch_id, ... }
```

- **Pros:**
  - Reconciliation state lives with the canonical record
  - No new table
  - Simple to check "was this player reconciled?" — just read the loyalty record
- **Cons / risks:**
  - JSONB is less queryable for queue/reporting (no proper indexes on status)
  - Loses history if player is reconciled multiple times (across multiple imports)
  - Doesn't support pending state well (player_loyalty record may not exist yet for new imports)
  - Not approved in SRM JSON metadata exceptions list — requires governance approval
  - Mixes operational workflow state with canonical domain data
- **Cost / complexity:** Low — column addition + JSON handling. But operational complexity in querying and reporting.
- **Security posture impact:** Same RLS as player_loyalty. But JSONB is harder to audit and validate.
- **Exit ramp:** Must migrate JSONB to proper table if reconciliation grows in complexity. History loss risk.

## 6) Decision to make (explicit)

- **Decision:** Where does reconciliation state live, and how is apply/revert executed?
- **Recommendation:** Option A — dedicated table + SECURITY DEFINER RPCs
- **Decision drivers:**
  - Bounded context purity (LoyaltyService owns its own state)
  - Consistency with PT-2 patterns (ADR-024 RPCs, Pattern C RLS)
  - Full before/after audit trail without JSONB tradeoffs
  - Extensibility for post-MVP policies without schema rework
- **Decision deadline:** After ingestion worker prerequisite is resolved

## 7) Open questions / unknowns

### Resolved by patch review

- **Papa Parse role:** UI-only for preview + header mapping. Server ingestion uses `csv-parse` (streaming). Papa Parse is not the server ingestion backbone.
- **Freshness rules:** Binary. Missing timestamp = always confirm. Older than threshold = stale + per-row confirm. No vibes.
- **Option B:** Explicitly rejected. No "temporary" bounded context violations.

### Still open

- **Tier mapping strategy (BOSS FIGHT):** Vendor tiers are likely free-text. MVP rule: tier mapping must be explicit and deterministic. Either importer provides canonical tier enum values only, OR a mapping step per batch ("Vendor 'Gold+' → PT-2 'Gold'"). No fuzzy matching. This is where imports go to die if we're not strict.
- **How are reconciliation records populated?** After ingestion worker stages rows, does a trigger create `loyalty_reconciliation` entries for rows with loyalty fields? Or explicit admin action ("generate reconciliation queue for batch X")?
- **Does `player_loyalty` always exist for imported players?** New players from import have no canonical loyalty record. Is that a "seed" (create new posture) vs. "reconcile" (compare and merge)?
- **PT-2 tier model:** Is tier an enum, numeric level, or free-text on `player_loyalty`? Determines upgrade-only comparison logic.
- **SECURITY DEFINER vs. SECURITY INVOKER:** For apply/revert RPCs — if atomic multi-table writes are needed (loyalty_reconciliation + player_loyalty + audit_log), SECURITY DEFINER is justified. If single-table, consider INVOKER with tight RLS. Treat DEFINER like nitroglycerin per ADR-018.

## 8) Definition of Done (thin)

- [ ] Ingestion worker prerequisite resolved (BLOCKER)
- [ ] Tier mapping strategy decided
- [ ] Decision recorded in ADR(s) (Phase 4)
- [ ] Acceptance criteria agreed (Phase 5 PRD)
- [ ] Implementation plan delegated (handoff to /build)

## Links

- Source PRD: `docs/00-vision/csv-import/PRD-LOYALTY-TIER-RECONCILIATION-v0.1(1).md`
- Scaffold patch: `docs/00-vision/csv-import/SCAFFOLD-LOYALTY-PATCH.md`
- Ingestion worker proposal: `docs/00-vision/csv-import/CSV-IMPORT-INGESTION.md`
- Feature Boundary: `docs/20-architecture/specs/loyalty-tier-reconciliation/FEATURE_BOUNDARY.md`
- SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (LoyaltyService, PlayerImportService)
- Design Brief/RFC: (Phase 2 — after blocker resolved)
- ADR(s): (Phase 4)
- PRD: (Phase 5)
- Exec Spec: (handoff)
