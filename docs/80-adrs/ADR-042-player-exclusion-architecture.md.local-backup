# ADR-042: Player Exclusion Architecture — Property-Scoped MVP

**Status:** Accepted
**Date:** 2026-03-10
**Owner:** PlayerService / Security
**Related:** ADR-015 (RLS Connection Pooling), ADR-020 (Track A Hybrid), ADR-024 (Authoritative Context), ADR-030 (Auth Hardening), ADR-040 (Identity Provenance)
**Triggered by:** GAP-PLAYER-EXCLUSION-WATCHLIST (regulatory compliance gap)

---

## Context

PT-2 has no mechanism to record or enforce player exclusion, watchlist, trespass, or ban status. The current player model tracks identity (`player_identity`) and enrollment (`player_casino.status` = `active` | `inactive`), but cannot express:

- **Self-exclusion** (voluntary, state-mandated programs)
- **Involuntary exclusion** (casino-initiated ban, trespass order)
- **Regulatory watchlist** (state gaming commission lists)
- **Temporal restrictions** (temporary suspension vs. permanent ban)

Floor staff have no system-level warning when a banned or self-excluded player is seated. This is a **regulatory compliance gap** in most gaming jurisdictions.

The GAP analysis (`docs/issues/gaps/GAP-PLAYER-EXCLUSION-WATCHLIST.md`) evaluated the design space and identified 5 hard decisions that must be formalized before implementation begins.

---

## Decisions

### D1: Property-Only MVP Scope (Company-Wide Deferred)

MVP implements **property-scoped exclusions only**. The `scope` column proposed in the GAP doc is dropped entirely.

**Rationale:** Company-wide exclusions (`scope = 'company'`) are semantically underdefined. A company-wide self-exclusion is conceptually one decision, not N casino rows pretending to be one. Proper implementation requires:
- A `company_exclusion` source record (not casino-scoped)
- Derived `player_exclusion` rows per property for RLS enforcement
- Lift/update propagation from source to derived rows

This complexity is blocked on MTL architecture stabilization and would over-engineer the MVP.

**Anti-creep clause:** This slice must not introduce company-scope propagation, replication logic, or preparatory multi-property materialization. Property-scoped exclusions only.

**Evolution path:** Post-MVP PRD after MTL stabilizes. Two-layer model (company source → property derived) is the recommended approach.

### D2: Enforcement Layer Split

Enforcement is split by severity level:

| Enforcement Level | Enforcement Layer | Behavior |
|-------------------|-------------------|----------|
| `hard_block` | **Database/RPC** (non-bypassable) | RAISE EXCEPTION on visit creation, enrollment, rating slip |
| `soft_alert` | **Application** (flexible) | Return warning flag; UI confirms with staff before proceeding |
| `monitor` | **Application** (flexible) | Log access for staff awareness; no block, no prompt |

**Rationale:** `hard_block` must be non-bypassable — no UI bug or client workaround should allow a hard-blocked player to be seated. `soft_alert` and `monitor` require UI flexibility (confirmation dialogs, badge display) that is better handled at the application layer.

**Classification vs. Enforcement are orthogonal axes:**
- `exclusion_type` = legal/business classification — _why_ the restriction exists (`self_exclusion`, `trespass`, `regulatory`, `internal_ban`, `watchlist`)
- `enforcement` = system action — _how_ the system responds (`hard_block`, `soft_alert`, `monitor`)

A `watchlist` is not automatically "just alert". A `trespass` is not automatically "always block". Enforcement can be updated without reclassifying the restriction type.

### D3: Canonical Active Predicate (Single Source of Truth)

An exclusion is **active** if and only if:

```sql
lifted_at IS NULL
AND effective_from <= now()
AND (effective_until IS NULL OR effective_until > now())
```

This predicate is implemented as a SQL function `is_exclusion_active(player_exclusion) RETURNS boolean` and must be used **consistently** across all surfaces: RPC enforcement guards, service-layer queries, search/lookup joins, partial indexes, and reporting.

**Rationale:** Without a single canonical predicate, different surfaces invent their own "active" logic and produce contradictory exclusion states. The SQL function is the single source of truth.

### D4: Enforcement Precedence (Deterministic Collapse)

When a player has multiple active exclusions, the surfaced `exclusion_status` follows strict severity order:

```
hard_block > soft_alert > monitor > clear
```

The **highest-severity active exclusion wins** at all read surfaces. This is implemented as a SQL function `get_player_exclusion_status(p_player_id uuid, p_casino_id uuid) RETURNS text` that returns `'blocked'` | `'alert'` | `'watchlist'` | `'clear'`.

**This function is the canonical source of truth.** TypeScript consumers must NOT reimplement precedence logic. All status reads flow through this SQL function.

**Rationale:** Multiple active exclusions need deterministic collapse. Without strict ordering, search results, Player 360, and visit creation could disagree on a player's status.

### D5: Lift Authority Policy (MVP = Admin-Only)

MVP starts with `admin`-only lift authority for all exclusion types. Evolution path reserved per type:

| Exclusion Type | MVP Lift Authority | Post-MVP Consideration |
|---------------|-------------------|----------------------|
| `internal_ban` | Property `admin` | Property `admin` |
| `trespass` | Property `admin` | May require legal sign-off workflow |
| `watchlist` | Property `admin` | Property `admin` |
| `self_exclusion` | Property `admin` + warning | State-mandated process, may be non-liftable |
| `regulatory` | Property `admin` + "externally governed" warning | Requires external authority update |

**Lift-only UPDATE semantics:** A `BEFORE UPDATE` trigger restricts changes to `{lifted_at, lifted_by, lift_reason}` only. No other column may be modified after creation. This preserves the compliance record's integrity.

**Rationale:** Regulatory self-exclusions often have state-mandated cooling-off periods and may be non-liftable by property staff. Starting admin-only with warnings is the safest MVP posture. The ADR reserves the evolution path without implementing it.

---

## Security Model

### Record Ownership vs. Enforcement Responsibility

**Record ownership:** PlayerService owns `player_exclusion` as the **source of restriction truth** — lifecycle management, retrieval, creation, and lift operations.

**Enforcement responsibility:** Downstream contexts own enforcement at their own write boundaries:

| Context | Enforcement Point |
|---------|------------------|
| VisitService | Visit creation / seating — block (`hard_block`) or warn (`soft_alert`) |
| CasinoService | Enrollment — reject `hard_block` players (future) |
| RatingSlipService | Rating slip creation — block for excluded players (future) |

This separation prevents a service-boundary food fight: PlayerService does not reach into Visit or Enrollment logic, and Visit does not own exclusion records.

### Critical Table Designation (ADR-030 D4)

`player_exclusion` is designated as a **security-critical table** per ADR-030 D4. Write-path RLS policies must use session-var-only for casino scope:

```sql
-- INSERT/UPDATE policies: no JWT fallback for casino_id
casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
```

JWT fallback is permitted for `staff_role` only (Option B per AUDIT-C2):
```sql
-- Role check: session-var preferred, JWT fallback allowed
COALESCE(
  NULLIF(current_setting('app.staff_role', true), ''),
  (auth.jwt() -> 'app_metadata' ->> 'staff_role')
) IN ('pit_boss', 'admin')
```

### RLS Policy Summary

| Operation | Pattern | Role Gate |
|-----------|---------|-----------|
| SELECT | Pattern C hybrid (COALESCE) | All authenticated |
| INSERT | Session-var-only casino scope | `pit_boss`, `admin` |
| UPDATE | Session-var-only casino scope | `admin` only (lift-only) |
| DELETE | Denial policy (`false`) | Denied for all |

---

## Consequences

### Positive

- **Regulatory compliance foundation:** System can now record and enforce player restrictions
- **Non-bypassable enforcement:** `hard_block` at DB/RPC level prevents UI workarounds
- **Audit-preserving:** Soft-lift pattern (`lifted_at/lifted_by`) maintains full compliance history
- **Single source of truth:** Canonical SQL functions prevent divergent "active" logic across surfaces
- **Extensible:** Enforcement levels and exclusion types can evolve independently

### Negative

- **Property-only limitation:** Company-wide exclusions require a follow-up PRD
- **Admin-only lift:** May be too restrictive for some operational workflows (pit_boss cannot lift internal bans)
- **Cross-context coupling:** Enforcement guards in `rpc_start_or_resume_visit` create a runtime dependency on PlayerService data

### Neutral

- Does not change any existing table schema
- Does not introduce new roles or permissions beyond existing `pit_boss` and `admin`
- UI surfaces are explicitly deferred — this ADR covers backend foundation only

---

## SRM Impact

**Amendment:** SRM 4.18.0 → 4.19.0

- Add `player_exclusion` to PlayerService table list
- Contract addition: "Source-of-truth for exclusion records. Enforcement delegated to downstream consumers."
- Cross-context consumption: VisitService consumes exclusion status for visit creation enforcement

---

## References

- [GAP Analysis](../issues/gaps/GAP-PLAYER-EXCLUSION-WATCHLIST.md)
- [EXEC-050](../21-exec-spec/EXEC-050-player-exclusion-watchlist.md)
- [ADR-015: RLS Connection Pooling](./ADR-015-connection-pooling-strategy.md)
- [ADR-024: Authoritative Context Derivation](./ADR-024_DECISIONS.md)
- [ADR-030: Auth Pipeline Hardening](./ADR-030-auth-system-hardening.md)
- [ADR-040: Identity Provenance Rule](./ADR-040-identity-provenance-rule.md)
- [SEC-001: RLS Policy Matrix](../30-security/SEC-001-rls-policy-matrix.md)
- [SEC-002: Casino-Scoped Security Model](../30-security/SEC-002-casino-scoped-security-model.md)
