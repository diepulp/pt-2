# GAP: Player Exclusion / Watchlist / Banned-Player Status

**Filed**: 2026-03-09
**Category**: ARCH / DATA
**Severity**: P1 — regulatory compliance surface, operational safety
**Bounded Context**: PlayerService (identity owner), CasinoService (enrollment owner)
**SRM Version**: 4.18.0

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

### 3.2 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Separate table, not a column on `player_casino` | Exclusions have their own lifecycle, audit trail, and can be multiple per player (e.g., trespass + watchlist simultaneously). |
| `casino_id` scoped (with `scope` flag) | RLS compatibility. Company-wide exclusions would be replicated per casino or use a future company-level table. |
| Soft-lift pattern (`lifted_at`) not hard delete | Audit trail for regulatory compliance. Exclusion history must be preserved. |
| `enforcement` level | Not all watchlist entries should block — some jurisdictions require monitoring-only for certain lists. |
| `exclusion_type` enum | Structured classification enables reporting, filtering, and jurisdiction-specific behavior. |

### 3.3 Indexes

```sql
-- Active exclusions lookup (most common query)
CREATE INDEX idx_player_exclusion_active
  ON player_exclusion (casino_id, player_id)
  WHERE lifted_at IS NULL;

-- Review date for scheduled reviews
CREATE INDEX idx_player_exclusion_review
  ON player_exclusion (review_date)
  WHERE lifted_at IS NULL AND review_date IS NOT NULL;

-- Regulatory reporting by jurisdiction
CREATE INDEX idx_player_exclusion_jurisdiction
  ON player_exclusion (jurisdiction, exclusion_type)
  WHERE lifted_at IS NULL;
```

### 3.4 RLS Policies

Follow ADR-015 Pattern C hybrid:
- **SELECT**: All authenticated casino staff (casino-scoped)
- **INSERT**: `pit_boss`, `admin` only
- **UPDATE**: `admin` only (lifting an exclusion is admin-level)
- **DELETE**: Denied (audit trail preservation)

---

## 4. Service Layer Impact

### 4.1 Bounded Context Ownership

**Recommendation**: PlayerService owns `player_exclusion` (identity context — "who is this player and what restrictions apply").

SRM addition:
```
PlayerService
  Tables: player, player_identity, player_note, player_tag, player_exclusion
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

| Consumer | Usage |
|----------|-------|
| **VisitService** | Check active `hard_block` exclusions before creating a visit/seating |
| **RatingSlipService** | Check before creating rating slips for excluded player |
| **CasinoService** | Check during enrollment — prevent enrolling a hard-blocked player |
| **CashierService** | Display alert during player lookup at cage |
| **Player 360 UI** | Display exclusion badge, history panel |

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

- **No existing data to migrate** — this is a net-new table
- `player_casino.status = 'inactive'` records should be reviewed: some may represent informal bans that should be converted to exclusion records
- `player_tag` records with `tag_name` containing "ban", "exclude", "trespass" (if any) should be audited

---

## 10. Risks & Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should `scope = 'company'` use a separate company-level table or replicate per casino? | Affects RLS design. Replication is simpler for RLS but creates consistency risk. |
| 2 | Should enforcement checks live in RPCs (DB-level) or service layer (app-level)? | DB-level is more secure (can't bypass), app-level is more flexible. Recommendation: DB-level for `hard_block`, app-level for `soft_alert`. |
| 3 | Do we need a `player_exclusion_document` table for uploaded trespass orders / court docs? | Storage integration (Supabase Storage). Defer to post-MVP unless regulatory requirement. |
| 4 | How does this interact with the MTL (Multi-Tenant Loyalty) cross-property model? | Company-wide exclusions must propagate across MTL-linked properties. |
| 5 | Should expired exclusions (`effective_until < now()`) auto-lift or require manual review? | Regulatory self-exclusions often require a cooling-off confirmation. |

---

## 11. Implementation Sequence (Recommended)

1. **PRD**: Write PRD for exclusion model (references this gap doc)
2. **ADR**: Decision on company-scope strategy + enforcement layer (DB vs. app)
3. **Migration**: `player_exclusion` table + RLS + indexes
4. **Service layer**: `services/player/exclusion.ts` + DTOs + schemas
5. **API routes**: CRUD endpoints
6. **Enforcement guards**: RPC-level checks in `rpc_create_visit`, `rpc_enroll_player`
7. **UI**: Player 360 exclusion panel, search badges, admin actions
8. **Reporting**: Exclusion audit report for compliance

---

## 12. References

- `services/player/dtos.ts` — Current player DTOs (no exclusion fields)
- `supabase/migrations/20260121145502_adr029_player_tag_table.sql` — Tag system (insufficient for exclusions)
- `supabase/migrations/20251225003922_adr022_player_identity_mvp.sql` — Identity model
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — Bounded context ownership
- `docs/30-security/SEC-001-rls-policy-matrix.md` — RLS policy patterns
