  ---
id: ADR-022
title: Player Identity & Enrollment Architecture (MVP - Pragmatic Scope)
version: 6.0
owner: Architecture
status: Accepted
date: 2025-12-23
deciders: Lead Architect
affects: [PlayerService, CasinoService, SEC-001, ADR-015]
last_review: 2025-12-23
supersedes: ADR-022 v5.0
---

# ADR-022: Player Identity & Enrollment Architecture (MVP - Pragmatic Scope)

**Status:** Accepted
**Date:** 2025-12-23
**Deciders:** Lead Architect
**Affects:** PlayerService, CasinoService (enrollment), SEC-001, ADR-015
**Supersedes:** ADR-022 v5.0 (full compliance scope)

---

## Context

Floor supervisors must enroll patrons into the player tracking system. The MVP requires capturing basic identity information from government-issued ID documents to support enrollment and player identification workflows.

**MVP Reality:**
- Tax compliance features (SSN/TIN, CTR thresholds) are **not required for initial launch**
- ID scanner integration is **planned but deferred** — ingestion will be manual until scanner is wired
- **Schema is scanner-shaped** — fields align with AAMVA scanner output (see `reference-pt-1/types/scanner.ts`)
- Existing `player` table is intentionally minimal and needs extension

**Key Decisions Preserved from v5:**
- **D1: Identity is casino-scoped** — patrons can enroll at multiple casinos independently
- **D2: Split identity from player core** — identity artifacts are structurally separate (extensible for future tax identity)
- **INV-2: No orphan identity** — identity rows require enrollment to exist first

---

## Decision

### D1. Identity scope is casino-scoped enrollment (PRESERVED)

Identity is a property of a patron's enrollment **at a casino**, not a single global identity record.

**Result:** Identity storage is keyed by `(casino_id, player_id)`.

### D2. Player core vs identity artifacts (SIMPLIFIED for MVP)

For MVP, we implement a pragmatic two-table model:

| Table | Purpose | Owner |
|-------|---------|-------|
| `player` | Core patron record (names, DOB, contact info) | PlayerService |
| `player_identity` | ID document metadata (address, doc fields) | PlayerService |
| `player_casino` | Enrollment relationship | CasinoService |

**Deferred to post-MVP:**
- `player_tax_identity` — SSN/TIN storage with RPC-gated access
- `player_identity_scan` — Raw scanner payload storage

### D3. Simple role-based access (SIMPLIFIED for MVP)

MVP uses straightforward RLS: staff can write, appropriate roles can read. No complex compliance role gating.

---

## MVP Scope

### In Scope (MVP)

| Component | Description |
|-----------|-------------|
| `player` extension | Add `middle_name`, `email`, `phone_number` columns |
| `player_identity` table | Scanner-shaped ID document metadata (casino-scoped) |
| `player_casino` | Enrollment relationship (already exists) |
| Manual enrollment flow | Staff-entered data populates scanner-shaped fields |
| Basic RLS | Staff write access, role-based read access |

**Design principle:** Schema is scanner-shaped; ingestion is manual until scanner is wired.

### Explicitly Deferred (Post-MVP)

| Component | Reason | Tracking |
|-----------|--------|----------|
| `player_tax_identity` | Tax compliance not required for launch | Future PRD |
| `player_identity_scan` | Scanner integration planned, not MVP | Future PRD |
| SSN/TIN storage/reveal | Requires encryption, audit infrastructure | Future PRD |
| CTR threshold enforcement | Finance/MTL integration deferred | Future PRD |
| `compliance` role | Not needed until tax features | Future PRD |
| Vault/pgsodium encryption | Deferred with tax identity | Future PRD |

---

## Data Model (MVP)

### player (Extended)

Existing table with new optional columns (scanner-aligned):

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| `id` | uuid | PK | Existing |
| `first_name` | text | NOT NULL | Existing — scanner: `firstName` |
| `last_name` | text | NOT NULL | Existing — scanner: `lastName` |
| `middle_name` | text | NULL | **NEW** — scanner: `middleName` |
| `birth_date` | date | NULL | Existing — scanner: `dateOfBirth` |
| `email` | text | NULL | **NEW** — Optional contact (not from scanner) |
| `phone_number` | text | NULL | **NEW** — Optional contact (not from scanner) |
| `created_at` | timestamptz | NOT NULL | Existing |

**Canonical verification:** Before migration, verify against `types/database.types.ts`.

**Note:** `player` is NOT casino-scoped (global patron identity). Casino enrollment is via `player_casino`.

### player_identity (NEW)

Casino-scoped ID document metadata (scanner-aligned):

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| `id` | uuid | PK, default gen_random_uuid() | Row identifier |
| `casino_id` | uuid | NOT NULL, FK → casino | Casino scoping |
| `player_id` | uuid | NOT NULL | Player reference |
| **Scanner Fields** | | | |
| `birth_date` | date | NULL | scanner: `dateOfBirth` — DOB from ID (matches PT-2 convention) |
| `gender` | text | NULL, CHECK (gender IN ('m','f','x')) | scanner: `gender` — lowercase; 'x' for non-binary/other |
| `eye_color` | text | NULL | scanner: `eyeColor` |
| `height` | text | NULL | scanner: `height` — formatted as feet-inches, e.g., "6-01" |
| `weight` | text | NULL | scanner: `weight` — e.g., in pounds |
| `address` | jsonb | NULL | scanner: `address` — structured address |
| `document_number` | text | NULL | scanner: `documentNumber` — **PII: UI shows masked last4 only** |
| `issue_date` | date | NULL | scanner: `issueDate` |
| `expiration_date` | date | NULL | scanner: `expirationDate` |
| `issuing_state` | text | NULL | scanner: `issuingState` |
| **System Fields** | | | |
| `document_type` | text | NULL | 'drivers_license', 'passport', 'state_id' |
| `verified_at` | timestamptz | NULL | When identity was verified |
| `verified_by` | uuid | NULL, FK → staff | Who verified |
| `created_at` | timestamptz | NOT NULL, default now() | Creation timestamp |
| `updated_at` | timestamptz | NOT NULL, default now() | Last update |
| `created_by` | uuid | NOT NULL, FK → staff | Actor tracking |

**Constraints:**
- `UNIQUE (casino_id, player_id)` — One identity per enrollment (implicitly creates index)
- `FK (casino_id, player_id) REFERENCES player_casino(casino_id, player_id)` — INV-2 enforcement

**Recommended Indexes:**
```sql
-- player: search by name (common floor ops pattern)
CREATE INDEX idx_player_last_first ON player(last_name, first_name);

-- player_identity: UNIQUE already creates index, but explicit for clarity
-- (Postgres handles this automatically for UNIQUE constraint)

-- player_casino: list active enrollments by casino
CREATE INDEX idx_player_casino_active ON player_casino(casino_id, status) WHERE status = 'active';
```

**Trigger (required):**
```sql
-- updated_at auto-update trigger
CREATE OR REPLACE FUNCTION update_player_identity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_player_identity_updated_at
  BEFORE UPDATE ON player_identity
  FOR EACH ROW
  EXECUTE FUNCTION update_player_identity_updated_at();
```

**DOB Derivation Rule:** `player_identity.birth_date` is the DOB from the presented ID document; `player.birth_date` is the canonical DOB for matching/search.
- **On identity create:** PlayerService sets `player.birth_date` from `player_identity.birth_date`
- **On identity update:** If `player_identity.birth_date` changes, PlayerService propagates to `player.birth_date` unless an admin has explicitly set a different value via direct player update (service logic tracks this as "admin override" — no extra column for MVP)
- **Admin override:** Admins can update `player.birth_date` directly; this value is preserved on subsequent identity updates

### player_casino (Existing + Extension)

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| `casino_id` | uuid | PK (composite) | Existing |
| `player_id` | uuid | PK (composite) | Existing |
| `status` | text | NOT NULL, default 'active' | Existing |
| `enrolled_at` | timestamptz | NOT NULL, default now() | Existing |
| `enrolled_by` | uuid | NULL, FK → staff | **NEW** — Who enrolled (actor tracking) |

**Canonical verification:** Current schema lacks `enrolled_by`. Migration must add it.

**Backfill:** No backfill required for MVP; `enrolled_by` is NULL for legacy rows. New enrollments populate it.

**Constraint:** `UNIQUE (casino_id, player_id)` already exists.

### Address JSONB Structure (Scanner-Aligned)

Matches `PlayerAddress` from scanner output:

```typescript
// Aligned with reference-pt-1/types/scanner.ts → PlayerAddress
interface IdentityAddress {
  street: string;      // scanner: street
  city: string;        // scanner: city
  state: string;       // scanner: state
  postalCode: string;  // scanner: postalCode
}
```

**Note:** Scanner uses camelCase; database stores as-is for direct mapping.

**Contract:** Address JSON keys (`street`, `city`, `state`, `postalCode`) are treated as a stable storage contract until post-MVP refactor; no partial renames.

**Nullability:** `address` may be partial (missing keys allowed). UI/service code must not assume all keys exist — use optional chaining or explicit null checks.

### Scanner Field Mapping (Reference)

Schema supports scanner-shaped fields; ingestion is manual until scanner is wired.

| Scanner Field (`ScannedIdData`) | Database Column | Table |
|---------------------------------|-----------------|-------|
| `firstName` | `first_name` | `player` |
| `lastName` | `last_name` | `player` |
| `middleName` | `middle_name` | `player` |
| `dateOfBirth` | `birth_date` | `player_identity` |
| `gender` | `gender` | `player_identity` |
| `eyeColor` | `eye_color` | `player_identity` |
| `height` | `height` | `player_identity` |
| `weight` | `weight` | `player_identity` |
| `address` | `address` (jsonb) | `player_identity` |
| `documentNumber` | `document_number` | `player_identity` |
| `issueDate` | `issue_date` | `player_identity` |
| `expirationDate` | `expiration_date` | `player_identity` |
| `issuingState` | `issuing_state` | `player_identity` |

**Reference:** `reference-pt-1/types/scanner.ts`

---

## Enrollment Flow (MVP)

### Sequence (Manual Entry)

```
1. Create/find player (PlayerService)
   └─ Match on (first_name, last_name, birth_date) + one of:
      • phone_number (if provided)
      • email (if provided)
   └─ If no contact provided: fall back to (first_name, last_name, birth_date) only
   └─ ⚠️ MVP-ACCEPTABLE: duplicates possible if no contact info; tracked as tech debt
   └─ If no match: INSERT into player
   └─ Returns player_id

2. Ensure casino enrollment (CasinoService)
   └─ Call CasinoService.enrollPlayer(casino_id, player_id)
   └─ UPSERT player_casino (casino_id, player_id, status='active')
   └─ Returns enrollment confirmation

3. Normalize inputs (PlayerService)
   └─ Trim whitespace, lowercase where applicable
   └─ gender: map synonyms ('M'→'m', 'Male'→'m', 'F'→'f', 'Female'→'f', 'X'→'x')
   └─ height/weight: normalize format (scanner may vary)

4. Upsert identity (PlayerService)
   └─ UPSERT player_identity for (casino_id, player_id)
   └─ FK constraint enforces enrollment exists (INV-2)
```

### Bounded Context Orchestration

| Step | Owner | API |
|------|-------|-----|
| Create player | PlayerService | `PlayerService.findOrCreatePlayer()` |
| Create enrollment | CasinoService | `CasinoService.enrollPlayer()` |
| Attach identity | PlayerService | `PlayerService.upsertIdentity()` |

**Key:** PlayerService does NOT write to `player_casino` directly. Enrollment is a CasinoService concern.

### Atomicity Recommendation

For "single-click enrollment" UX, provide a server action orchestrator that:
1. Calls PlayerService to create player (if needed)
2. Calls CasinoService to create enrollment
3. Calls PlayerService to attach identity

All three in a coordinated flow, but respecting bounded context ownership.

**Do NOT** create identity first and hope enrollment arrives later.

---

## Security Invariants (MVP)

### INV-1 Casino context binding (PRESERVED)

All access checks derive `casino_id` from session/JWT context; caller-provided `casino_id` is never trusted in security-sensitive flows.

### INV-2 Enrollment prerequisite (PRESERVED)

Identity rows MUST NOT exist unless a matching enrollment exists in `player_casino(casino_id, player_id)`.

**Enforcement:** FK constraint on `player_identity(casino_id, player_id)` → `player_casino(casino_id, player_id)`.

### INV-6 RLS UPDATE must include WITH CHECK (PRESERVED)

All UPDATE policies must include WITH CHECK mirroring USING to prevent scope mutation.

### Deferred Invariants (Post-MVP)

- INV-3: Least privilege separation (tax identity) — N/A for MVP
- INV-4: Tax ID reveal auditing — N/A for MVP
- INV-5: Key management — N/A for MVP
- INV-7: Identity writes audited — OPTIONAL for MVP, REQUIRED when tax identity added

---

## Access Control Matrix (MVP)

### player_identity

| Role | Read | Write | Notes |
|------|------|-------|-------|
| `pit_boss` | ✅ | ✅ | Primary enrollment role |
| `admin` | ✅ | ✅ | Full access |
| `cashier` | ✅ | ❌ | Read-only (may need for verification) |
| `dealer` | ❌ | ❌ | No access to PII |

### player (core)

| Role | Read | Write | Notes |
|------|------|-------|-------|
| `pit_boss` | ✅ | ✅ | Create/update players |
| `admin` | ✅ | ✅ | Full access |
| `cashier` | ✅ | ❌ | Read for transactions |
| `dealer` | ❌ | ❌ | No direct player access |

**Note:** `compliance` role not needed until tax identity features are implemented.

---

## RLS Policies (MVP)

**Pattern C (Hybrid with Fallback)** per ADR-015:
- First preference: `current_setting('app.X', true)` (transaction-local via `set_rls_context`)
- Fallback: `auth.jwt() -> 'app_metadata' ->> 'X'` (JWT claims)

**Staff gate:** We gate on `casino_id` + `staff_role` only. We do NOT use `auth.uid() IS NOT NULL` because `auth.uid()` returns the Supabase auth.users id, which may not equal staff.id and is meaningless in service-role contexts. The actual security gates are casino context + role.

### player_identity

```sql
-- Read: Staff in same casino can read (pit_boss, admin, cashier)
CREATE POLICY "player_identity_select" ON player_identity
  FOR SELECT USING (
    casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin', 'cashier')
  );

-- Write: pit_boss and admin only
CREATE POLICY "player_identity_insert" ON player_identity
  FOR INSERT WITH CHECK (
    casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

CREATE POLICY "player_identity_update" ON player_identity
  FOR UPDATE
  USING (
    casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')  -- No cashier: they can't write
  )
  WITH CHECK (
    casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- REQUIRED: Enable RLS on new table
ALTER TABLE player_identity ENABLE ROW LEVEL SECURITY;
```

### player (RLS to be added/verified)

`player` is a global table (not casino-scoped). RLS gates on staff role only.

```sql
-- Existing table: verify RLS is enabled
ALTER TABLE player ENABLE ROW LEVEL SECURITY;

-- Read: pit_boss, admin, cashier
CREATE POLICY "player_select" ON player
  FOR SELECT USING (
    COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin', 'cashier')
  );

-- Write: pit_boss, admin only
CREATE POLICY "player_insert" ON player
  FOR INSERT WITH CHECK (
    COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

CREATE POLICY "player_update" ON player
  FOR UPDATE
  USING (
    COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );
```

### player_casino (RLS for enrolled_by write)

`player_casino` is casino-scoped. New `enrolled_by` column requires UPDATE policy adjustment.

```sql
-- Verify RLS is enabled (existing table)
ALTER TABLE player_casino ENABLE ROW LEVEL SECURITY;

-- INSERT: pit_boss, admin can enroll (sets enrolled_by)
CREATE POLICY "player_casino_insert" ON player_casino
  FOR INSERT WITH CHECK (
    casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- UPDATE: pit_boss, admin can modify enrollment (status, enrolled_by backfill)
CREATE POLICY "player_casino_update" ON player_casino
  FOR UPDATE
  USING (
    casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF(current_setting('app.staff_role', true), ''),
      (auth.jwt() -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );
```

---

## Ownership and Bounded Context

**SRM alignment (normative):**

| Service | Owns | Responsibility |
|---------|------|----------------|
| **CasinoService** | `player_casino` | Enrollment relationship (who is enrolled where) |
| **PlayerService** | `player`, `player_identity` | Identity artifacts (who is this person) |

**Bounded Context Rule:**
- PlayerService MUST NOT write directly to `player_casino`
- Enrollment is orchestrated via CasinoService API/RPC
- PlayerService owns identity; CasinoService owns enrollment relationship

**Rule:** Other bounded contexts must access identity data through PlayerService queries/APIs, not direct table access. (RLS still permits role-based reads; this is a service encapsulation rule, not an RLS block.)

**SLAD Compliance Guardrail:** Cross-context direct table access to `player_identity` is a SLAD (Service Layer Access Discipline) violation. CI/lint gates should check for unauthorized imports of identity table types or direct query usage outside PlayerService.

---

## Lifecycle (MVP)

### Deactivation

When enrollment is deactivated (`player_casino.status = 'inactive'`):
- Identity remains in database (soft retention)
- RLS can be extended to filter inactive enrollments from non-admin reads

### Deletion

- Hard deletes are NOT supported in MVP
- Soft deactivation only for audit trail preservation

---

## Migration Path to Full Compliance (Post-MVP)

When tax compliance features are needed:

1. **Add `compliance` to `staff_role` enum**
2. **Create `player_tax_identity` table** (per v5 spec)
3. **Implement tax RPCs** (`reveal_tax_id`, `upsert_tax_identity`)
4. **Add audit logging** for tax operations (INV-4, INV-7)
5. **Integrate Vault/pgsodium** for encryption
6. **Update RLS** to gate tax identity by compliance role

The MVP architecture is designed to be **additive** — no breaking changes required.

---

## Alternatives Considered

### A1. Implement full v5 scope immediately

**Rejected:** Over-engineering for MVP. Tax compliance features add significant complexity (encryption, audit logging, compliance role) without immediate business value.

### A2. Put identity fields directly on player table

**Rejected:**
- `player` is global (not casino-scoped)
- Identity fields are casino-scoped (enrollment-specific)
- Structural separation enables future tax identity without refactoring

### A3. Skip player_identity entirely, use only player

**Rejected:** ID document metadata (address, issuing state, expiration) is casino-specific enrollment data, not global patron attributes.

---

## Consequences

### Positive

- **Reduced complexity:** No encryption, compliance roles, or audit infrastructure for MVP
- **Faster delivery:** Focus on core enrollment workflow
- **Extensible:** Clean migration path to full compliance when needed
- **Casino-scoped:** Aligns with existing RLS patterns

### Negative / Tradeoffs

- **Deferred compliance:** Tax features require future work
- **No scanner integration:** Manual entry only for MVP
- **Limited audit:** Identity writes not audited until post-MVP

### Technical Debt (Tracked)

| Item | Priority | Trigger |
|------|----------|---------|
| Tax identity implementation | High | First compliance requirement |
| Scanner integration | Medium | Hardware availability |
| Identity write auditing | Medium | Before tax identity |
| Player matching enhancement | Medium | First duplicate complaint (no-contact case) — add fuzzy matching + optional doc last4 + merge workflow |

---

## Implementation Artifacts

### Migrations (to be created)

```
supabase/migrations/YYYYMMDDHHMMSS_player_contact_columns.sql
supabase/migrations/YYYYMMDDHHMMSS_player_identity_mvp.sql
```

### Migration Ordering (CRITICAL)

The FK `(casino_id, player_id) → player_casino` enforces **migration ordering**:

1. **player_casino PK must exist first** — any migration altering `player_casino` composite key columns must run before `player_identity` table creation
2. **Sequence:** `player_contact_columns` → `player_casino` changes (if any) → `player_identity_mvp`

**Why this matters:**
- `player_identity` FK references `player_casino(casino_id, player_id)`
- If you alter `player_casino` PK after `player_identity` exists, FK constraint will block or require cascade handling
- Deploy ordering must mirror migration ordering

**Runtime ordering (service orchestration):**
- Enrollment (`player_casino` INSERT) MUST complete before identity (`player_identity` UPSERT)
- FK constraint will reject identity insert if enrollment doesn't exist

### Service Layer

```
services/player/
├── dtos.ts          # Add PlayerIdentityDTO
├── schemas.ts       # Add validation schemas
├── crud.ts          # Add identity CRUD
└── index.ts         # Export identity functions
```

---

## Acceptance Criteria (MVP)

- [ ] `player` table has `email` and `phone_number` columns
- [ ] `player_identity` table exists with enrollment-scoped uniqueness (casino_id, player_id)
- [ ] FK constraint enforces enrollment prerequisite (INV-2)
- [ ] RLS policies allow pit_boss/admin write, appropriate roles read
- [ ] Enrollment flow works: player → enrollment → identity
- [ ] Dealer cannot access player_identity
- [ ] No tax-related tables or RPCs in MVP

---

## References

### Internal Documentation

- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — Bounded context ownership
- `docs/30-security/SEC-001-rls-policy-matrix.md` — RLS policy templates
- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` — Pattern C (Hybrid) RLS

### Superseded

- `docs/80-adrs/ADR-022_Player_Identity_Enrollment_ARCH_v5.md` — Full compliance scope (retained for future reference)
