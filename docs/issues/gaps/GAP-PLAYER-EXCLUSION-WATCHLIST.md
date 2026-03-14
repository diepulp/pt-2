# GAP: Player Exclusion / Watchlist / Banned-Player Status

**Filed**: 2026-03-09
**Revised**: 2026-03-09 (direction audit patch delta applied)
**Category**: ARCH / DATA
**Severity**: P1 — regulatory compliance surface, operational safety
**Bounded Context**: PlayerService (record owner), CasinoService (enrollment owner)
**SRM Version**: 4.18.0
**Audit Status**: Direction approved with corrections — see [Appendix A](#appendix-a-patch-delta-from-direction-audit)

---

## 1. Problem Statement

PT-2 has **no mechanism to record or enforce player exclusion, watchlist, trespass, or ban status**. The current player model tracks identity (`player_identity`) and enrollment (`player_casino.status` = `active` | `inactive`), but cannot express:

- **Self-exclusion** (voluntary, state-mandated programs)
- **Involuntary exclusion** (casino-initiated ban, trespass order)
- **Regulatory watchlist** (state gaming commission lists)
- **Temporary suspension** vs. permanent ban
- **Cross-property exclusion** (company-wide ban across multiple casinos)

Floor staff currently have no system-level warning when a banned or self-excluded player is seated or enrolled. This is a **regulatory compliance gap** in most gaming jurisdictions.

---

## 2. Current State Analysis

### 2.1 Player Tables (what exists today)

| Table | Owner | Relevant Fields | Gap |
|-------|-------|----------------|-----|
| `player` | PlayerService | `id`, `first_name`, `last_name`, `birth_date` | No status column. Pure identity record. |
| `player_casino` | CasinoService | `status` (`active`/`inactive`), `enrolled_at` | Binary status. No exclusion reason, no expiry, no enforcement type. |
| `player_identity` | PlayerService | Document hash, verified_at, physical descriptors | ID verification only. No exclusion flag. |
| `player_tag` | PlayerService | `tag_name`, `tag_category` (`vip`/`attention`/`service`/`custom`) | Could _informally_ tag "banned" but: no enforcement, no expiry, no regulatory classification, no audit trail beyond soft-delete. |
| `player_note` | PlayerService | `content` (free text), append-only | Annotations only. No structured exclusion data. |

### 2.2 Enrollment Status is Insufficient

`player_casino.status` is owned by CasinoService and carries only `active`/`inactive`. Setting a banned player to `inactive` loses:
- **Why** they were excluded (self-exclusion vs. trespass vs. regulatory)
- **When** the exclusion expires (if temporary)
- **Who** initiated the exclusion (staff actor, regulatory body, player self-request)
- **Scope** of exclusion (single property vs. company-wide)
- **Legal document references** (trespass order number, state exclusion list ID)

### 2.3 Tag System is Insufficient

`player_tag` with `tag_category = 'attention'` could mark a player as "watch", but lacks:
- Structured exclusion type enum (self-exclusion, trespass, regulatory, internal)
- Expiration / review date
- Enforcement hooks (block enrollment, block rating slip, alert on seating)
- Regulatory audit fields (jurisdiction, list source, external reference ID)
- Cross-casino scope (tags are casino-scoped by design)

---

## 3. Proposed Model: `player_exclusion`

### 3.1 New Table

```sql
CREATE TABLE player_exclusion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id       uuid NOT NULL REFERENCES casino(id),
  player_id       uuid NOT NULL REFERENCES player(id),

  -- Classification
  exclusion_type  text NOT NULL
    CHECK (exclusion_type IN (
      'self_exclusion',      -- Voluntary (state program or casino program)
      'trespass',            -- Casino-issued trespass / ban
      'regulatory',          -- State gaming commission list
      'internal_ban',        -- Internal operational ban (non-trespass)
      'watchlist'            -- Heightened monitoring, not a ban
    )),

  -- Severity / enforcement level
  enforcement     text NOT NULL DEFAULT 'hard_block'
    CHECK (enforcement IN (
      'hard_block',    -- Prevent enrollment, seating, rating slips
      'soft_alert',    -- Allow operations but display prominent warning
      'monitor'        -- Log access, no block, staff awareness only
    )),

  -- Temporal scope
  effective_from  timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,           -- NULL = permanent / indefinite
  review_date     timestamptz,           -- Next mandatory review

  -- Reason & documentation
  reason          text NOT NULL,         -- Free-text reason
  external_ref    text,                  -- Trespass order #, state list ID, etc.
  jurisdiction    text,                  -- State / regulatory body (e.g., 'NV', 'NJ')

  -- Actor tracking
  created_by      uuid NOT NULL REFERENCES staff(id),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Lift / resolve
  lifted_by       uuid REFERENCES staff(id),
  lifted_at       timestamptz,
  lift_reason     text,

  -- Cross-property scope
  scope           text NOT NULL DEFAULT 'property'
    CHECK (scope IN ('property', 'company'))
);
```

### 3.2 Classification vs Enforcement Semantics

> **AUDIT CORRECTION (C3):** Type does not determine behavior alone. Enforcement drives system action.

These are **orthogonal axes** and must not be conflated:

- **`exclusion_type`** = legal / business classification — _why_ the restriction exists
  - Examples: `self_exclusion`, `trespass`, `regulatory`, `internal_ban`, `watchlist`
- **`enforcement`** = what the system must do — _how_ the system responds
  - Examples: `hard_block`, `soft_alert`, `monitor`

A `watchlist` is not automatically "just alert". A `trespass` is not automatically "always block". Policy may change over time; enforcement can be updated without reclassifying the restriction type. Future policy changes should require **data changes**, not enum surgery.

### 3.3 Canonical Active Predicate

> **AUDIT CORRECTION (C4):** `lifted_at IS NULL` alone is insufficient.

An exclusion is **active** if and only if:

```sql
lifted_at IS NULL
AND effective_from <= now()
AND (effective_until IS NULL OR effective_until > now())
```

This predicate must be used **consistently** across:
- RPC enforcement guards
- Service-layer queries
- Search/lookup joins
- Partial indexes
- Reporting queries

Without a single canonical predicate, different surfaces will invent their own "active" logic and produce contradictory exclusion states.

### 3.4 Enforcement Precedence

> **AUDIT CORRECTION (C5):** Multiple active exclusions need deterministic collapse.

When a player has multiple active exclusions, the surfaced `exclusion_status` follows strict severity order:

```
hard_block > soft_alert > monitor > clear
```

The **highest-severity active exclusion wins** at all read surfaces. This applies to:
- Search result badges
- Enrollment guards
- Visit creation checks
- Player 360 header indicator

All consumers derive the same collapsed status. No surface may invent its own precedence logic.

### 3.5 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Separate table, not a column on `player_casino` | Exclusions have their own lifecycle, audit trail, and can be multiple per player (e.g., trespass + watchlist simultaneously). |
| `casino_id` scoped (with `scope` flag) | RLS compatibility. Company-wide exclusions would be replicated per casino or use a future company-level table. |
| Soft-lift pattern (`lifted_at`) not hard delete | Audit trail for regulatory compliance. Exclusion history must be preserved. |
| `enforcement` level | Not all watchlist entries should block — some jurisdictions require monitoring-only for certain lists. |
| `exclusion_type` enum | Structured classification enables reporting, filtering, and jurisdiction-specific behavior. |
| Type ≠ behavior | `exclusion_type` classifies; `enforcement` drives system action. They are orthogonal. |

### 3.3 Indexes

```sql
-- Active exclusions lookup — uses canonical active predicate (C4)
CREATE INDEX idx_player_exclusion_active
  ON player_exclusion (casino_id, player_id)
  WHERE lifted_at IS NULL
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now());

-- Review date for scheduled reviews
CREATE INDEX idx_player_exclusion_review
  ON player_exclusion (review_date)
  WHERE lifted_at IS NULL AND review_date IS NOT NULL;

-- Regulatory reporting by jurisdiction
CREATE INDEX idx_player_exclusion_jurisdiction
  ON player_exclusion (jurisdiction, exclusion_type)
  WHERE lifted_at IS NULL;
```

> **Note:** The active index uses `now()` in the predicate, which means it is evaluated at query time, not index-build time. For high-volume deployments, consider a materialized view or scheduled revalidation if temporal precision becomes a performance concern.

### 3.7 RLS Policies

Follow ADR-015 Pattern C hybrid:
- **SELECT**: All authenticated casino staff (casino-scoped)
- **INSERT**: `pit_boss`, `admin` only
- **UPDATE**: `admin` only (lifting an exclusion is admin-level)
- **DELETE**: Denied (audit trail preservation)

### 3.8 Lift Authority Policy

> **AUDIT CORRECTION (C6):** Not all exclusions should be liftable by property-level admin.

Lift authority varies by exclusion type and source:

| Exclusion Type | MVP Lift Authority | Post-MVP Consideration |
|---------------|-------------------|----------------------|
| `internal_ban` | Property `admin` | Property `admin` |
| `trespass` | Property `admin` (with documented review) | May require legal sign-off workflow |
| `watchlist` | Property `admin` | Property `admin` |
| `self_exclusion` | Property `admin` + cooling-off period | State-mandated process, may be non-liftable by property |
| `regulatory` | **Not liftable by property staff** | Requires external authority update |

MVP starts with `admin`-only as the default for all types. The ADR must explicitly state that lift constraints will evolve per exclusion type and jurisdiction, and that `regulatory` exclusions should be treated as externally governed even at MVP.

---

## 4. Service Layer Impact

### 4.1 Bounded Context Ownership

> **AUDIT CORRECTION (C1):** Ownership rationale must distinguish record ownership from enforcement responsibility.

**Record ownership**: `PlayerService` owns `player_exclusion` as the **source of restriction truth** — lifecycle management, retrieval, creation, and lift operations.

**Enforcement responsibility**: Downstream contexts own enforcement at their own write boundaries:

| Context | Enforcement Point |
|---------|------------------|
| `CasinoService` | Enrollment — reject `hard_block` players |
| `VisitService` | Visit creation / seating — block or warn |
| `RatingSlipService` | Rating slip creation — block for excluded players |
| `CashierService` | Cage lookup — surface alert |

This separation prevents a service-boundary food fight: PlayerService does not reach into Visit or Enrollment logic, and Visit does not own exclusion records.

SRM addition:
```
PlayerService
  Tables: player, player_identity, player_note, player_tag, player_exclusion
  Contract: Source-of-truth for exclusion records. Enforcement delegated to consumers.
```

### 4.2 New Service Files

```
services/player/
├── exclusion.ts          # CRUD: createExclusion, liftExclusion, getActiveExclusions
├── exclusion-dtos.ts     # PlayerExclusionDTO, CreateExclusionInput, LiftExclusionInput
├── exclusion-schemas.ts  # Zod validation
└── exclusion-mappers.ts  # Row → DTO
```

### 4.3 DTO Surface

```typescript
export interface PlayerExclusionDTO {
  id: string;
  casino_id: string;
  player_id: string;
  exclusion_type: 'self_exclusion' | 'trespass' | 'regulatory' | 'internal_ban' | 'watchlist';
  enforcement: 'hard_block' | 'soft_alert' | 'monitor';
  effective_from: string;
  effective_until: string | null;
  review_date: string | null;
  reason: string;
  external_ref: string | null;
  jurisdiction: string | null;
  scope: 'property' | 'company';
  created_by: string;
  created_at: string;
  lifted_by: string | null;
  lifted_at: string | null;
  lift_reason: string | null;
}
```

### 4.4 Cross-Context Consumers

Consumers query `PlayerService` for active exclusion status and enforce at their own boundaries (see §4.1). Each consumer applies the canonical active predicate (§3.3) and respects enforcement precedence (§3.4).

| Consumer | Enforcement Action | Precedence Applied |
|----------|-------------------|-------------------|
| **CasinoService** | Block enrollment for `hard_block` | Yes — highest active wins |
| **VisitService** | Block seating (`hard_block`), warn (`soft_alert`) | Yes |
| **RatingSlipService** | Block rating slip for `hard_block` players | Yes |
| **CashierService** | Display alert during cage lookup | Yes — badge reflects highest |
| **Player 360 UI** | Exclusion badge + history panel | Yes |

---

## 5. API Surface

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/players/[playerId]/exclusions` | GET | List all exclusions (active + history) |
| `/api/v1/players/[playerId]/exclusions` | POST | Create new exclusion |
| `/api/v1/players/[playerId]/exclusions/[exclusionId]/lift` | POST | Lift an exclusion |
| `/api/v1/players/[playerId]/exclusions/active` | GET | Active exclusions only (hot path for enforcement) |

---

## 6. UI Impact

### 6.1 Player 360 Dashboard

- **Header badge**: Red "EXCLUDED" / yellow "WATCHLIST" indicator on player profile
- **Exclusion tab/panel**: History of all exclusions with status, dates, actors
- **Enforcement toast**: When any staff searches for or opens a hard-blocked player

### 6.2 Player List / Search

- Exclusion status icon in search results and player list rows
- Filter: "Show excluded players" toggle

### 6.3 Admin Actions

- "Add Exclusion" action on player profile (pit_boss+)
- "Lift Exclusion" action (admin only)
- Exclusion review queue (upcoming `review_date` items)

---

## 7. Enforcement Integration Points

### 7.1 Enrollment Guard

```
rpc_enroll_player() → Check player_exclusion WHERE enforcement = 'hard_block'
  → If active: RAISE EXCEPTION 'Player is excluded (type: %)', exclusion_type
```

### 7.2 Visit/Seating Guard

```
rpc_create_visit() → Check player_exclusion WHERE enforcement IN ('hard_block', 'soft_alert')
  → hard_block: RAISE EXCEPTION
  → soft_alert: Return warning flag in response, let UI confirm
```

### 7.3 Search/Lookup Alert

Player search RPCs should join `player_exclusion` to return an `exclusion_status` flag:
- `clear` — no active exclusions
- `watchlist` — monitor-level exclusion active
- `alert` — soft_alert exclusion active
- `blocked` — hard_block exclusion active

---

## 8. Regulatory Considerations

| Jurisdiction | Requirement | Impact |
|-------------|-------------|--------|
| Nevada (NGC) | Mandatory self-exclusion program, excluded patron list | Must support `regulatory` type with NGC list cross-reference |
| New Jersey (DGE) | Statewide self-exclusion list | External ref to DGE list ID |
| Multi-state | Varying exclusion periods (1yr, 5yr, lifetime) | `effective_until` + `review_date` support |
| All | Audit trail for exclusion decisions | Append-only history with actor tracking |
| AML/CTR | Watchlist may overlap with financial monitoring | `watchlist` type separate from ban types |

---

## 9. Migration Considerations

> **AUDIT CORRECTION (C7):** Net-new schema does not mean zero legacy cleanup.

- **No canonical source table exists to migrate from automatically** — `player_exclusion` is a net-new table with no predecessor schema
- **Data audit required**: `player_casino.status = 'inactive'` records should be reviewed — some may represent informal bans that should be manually converted to exclusion records during rollout
- **Tag audit required**: `player_tag` records with `tag_name` containing "ban", "exclude", "trespass" (if any) should be identified and reconciled
- **Rollout plan** should include a one-time data review checklist for operations staff to classify existing informal exclusions into the new structured model

---

## 10. Risks & Open Questions

> **AUDIT CORRECTION (C2):** Company-scope is the biggest design risk and must not ship ambiguous.

### 10.1 Company-Scope Strategy (MUST DECIDE IN ADR)

The `scope = 'company'` column is semantically underdefined. A company-wide self-exclusion or trespass is conceptually **one decision**, not N casino rows pretending to be one.

**Option A — MVP deferral (recommended):**
Limit MVP to **property-scoped exclusions only**. Drop the `scope` column. Explicitly defer company-wide exclusions to a follow-up PRD after MTL architecture stabilizes.

**Option B — Two-layer model:**
- One `company_exclusion` source record (company-level, not casino-scoped)
- Derived `player_exclusion` rows per property for RLS enforcement
- Lift/update propagates from source to derived rows

Either path is viable. What is **not** viable is carrying `scope = 'company'` into implementation without defining propagation, consistency, and lift semantics.

### 10.2 Remaining Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| 1 | Enforcement layer split: DB-level for `hard_block`, app-level for `soft_alert`? | DB-level is non-bypassable. App-level is flexible. | **Recommendation stands** — decide in ADR |
| 2 | `player_exclusion_document` table for uploaded trespass orders / court docs? | Storage integration (Supabase Storage). | Defer to post-MVP unless regulatory requirement |
| 3 | MTL cross-property interaction for company-wide exclusions? | Depends on company-scope decision (§10.1). | Blocked on §10.1 |
| 4 | Auto-expiry vs manual review for `effective_until` past? | Regulatory self-exclusions often require cooling-off confirmation. | Decide in ADR — recommend manual review for `self_exclusion`, auto-expiry for `internal_ban` |
| 5 | Lift authority variation by exclusion type? | See §3.8. MVP starts admin-only; ADR must reserve evolution path. | Addressed in §3.8 |

---

## 11. Implementation Sequence (Recommended)

1. **ADR**: Hard decisions required before anything else:
   - Company-scope strategy (§10.1): property-only MVP or two-layer model
   - Enforcement layer split: DB vs. app by enforcement level
   - Canonical active predicate (§3.3): formalize as reusable SQL fragment
   - Precedence order (§3.4): codify `hard_block > soft_alert > monitor > clear`
   - Lift authority policy (§3.8): MVP defaults + evolution path
2. **PRD**: Write PRD for exclusion model (references this gap doc + ADR)
3. **Migration**: `player_exclusion` table + RLS + indexes (property-scope only if Option A)
4. **Service layer**: `services/player/exclusion.ts` + DTOs + schemas
5. **API routes**: CRUD endpoints
6. **Enforcement guards**: RPC-level checks in `rpc_create_visit`, `rpc_enroll_player`
7. **Data audit**: Review existing `player_casino` inactive + ad hoc tags (§9)
8. **UI**: Player 360 exclusion panel, search badges, admin actions
9. **Reporting**: Exclusion audit report for compliance

---

## 12. References

- `services/player/dtos.ts` — Current player DTOs (no exclusion fields)
- `supabase/migrations/20260121145502_adr029_player_tag_table.sql` — Tag system (insufficient for exclusions)
- `supabase/migrations/20251225003922_adr022_player_identity_mvp.sql` — Identity model
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — Bounded context ownership
- `docs/30-security/SEC-001-rls-policy-matrix.md` — RLS policy patterns

---

## Appendix A: Patch Delta from Direction Audit

**Audit source**: `exclusion-watchlist-direction-audit.md` (2026-03-09)
**Verdict**: Direction approved with corrections

### Corrections Applied

| ID | Finding | Severity | Section Updated | Status |
|----|---------|----------|----------------|--------|
| C1 | Ownership rationale too tidy — must separate record ownership from enforcement responsibility | Structural | §4.1 rewritten | Applied |
| C2 | Company-scope is biggest design risk — `scope = 'company'` semantically underdefined | Structural | §10.1 added as forced ADR decision | Applied |
| C3 | Classification vs enforcement needs sharper semantics — type ≠ behavior | Semantic | §3.2 added | Applied |
| C4 | "Active exclusion" not canonically defined — `lifted_at IS NULL` alone is insufficient | Correctness | §3.3 added with full predicate | Applied |
| C5 | Overlap and precedence policy missing — multiple active exclusions need deterministic collapse | Correctness | §3.4 added with severity order | Applied |
| C6 | Lift authority too blunt — not all exclusion types should be admin-liftable | Policy | §3.8 added with type-based authority table | Applied |
| C7 | "No data to migrate" is only partially true — legacy audit burden exists | Accuracy | §9 reworded | Applied |

### Audit Confirmations (no change needed)

| Finding | Verdict |
|---------|---------|
| Separate table is the correct model | Confirmed |
| Audit-preserving lift pattern (`lifted_at/lifted_by`) | Confirmed |
| Enforcement split (DB for hard_block, app for soft_alert) | Confirmed |
| UI/search visibility of exclusion status | Confirmed |

### ADR Decisions Required (from audit)

The following **must** be decided in an ADR before implementation begins:

1. **Ownership contract** — Who owns the record vs who owns enforcement (§4.1 provides recommendation)
2. **Company-scope strategy** — Property-only MVP or two-layer model (§10.1)
3. **Canonical active predicate** — One source of truth for "is this exclusion active?" (§3.3)
4. **Enforcement precedence** — How multiple active rows collapse to one status (§3.4)
5. **Lift authority policy** — Whether some exclusion classes are non-liftable or require elevated workflow (§3.8)
