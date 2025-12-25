---
id: ADR-022
title: Player Identity & Enrollment Architecture (MVP - Production Ready)
version: 7.1
owner: Architecture
status: Accepted
date: 2025-12-23
deciders: Lead Architect, 7-Agent Security Audit Panel
affects: [PlayerService, CasinoService, SEC-001, ADR-015]
last_review: 2025-12-23
supersedes: ADR-022 v7.0
audit_ref: 7-agent-security-audit-2025-12-23
---

# ADR-022: Player Identity & Enrollment Architecture (MVP - Production Ready)

**Status:** Accepted
**Date:** 2025-12-23
**Deciders:** Lead Architect, 7-Agent Security Audit Panel
**Affects:** PlayerService, CasinoService (enrollment), SEC-001, ADR-015
**Supersedes:** ADR-022 v7.0 (security audit fixes applied)

---

## Changelog from v6.0

| Change | Reason | Audit Vote |
|--------|--------|------------|
| Added `(select auth.uid()) IS NOT NULL` to all RLS policies | ADR-015 Pattern C compliance | 8/8 unanimous |
| Added `UNIQUE (casino_id, player_id)` constraint to player_casino | FK dependency fix | 8/8 unanimous |
| Added explicit DELETE denial policies | Audit trail enforcement | 6/8 majority |
| Added `(select ...)` wrappers for performance | Connection pooling optimization | 5/8 majority |
| Documented bounded context enforcement | SLAD compliance fix | 6/8 majority |
| Rejected role-only gate for player table | Keep existing enrollment-filtered policy | 6/8 majority |
| Updated acceptance criteria | Verification gates | 8/8 unanimous |

## Changelog from v7.0 (Security Audit 2025-12-23)

| Change | Reason | Audit Decision |
|--------|--------|----------------|
| Added actor binding WITH CHECK for `created_by`/`enrolled_by`/`verified_by` | Prevent audit column spoofing (INV-9) | ACCEPT |
| Replaced `document_number` with `document_number_hash` + `document_number_last4` | Reduce breach impact; hash for dedup, last4 for display | MODIFY |
| Added key field immutability trigger (INV-10) | Prevent player_id/casino_id swapping within same casino | ACCEPT |
| Fixed index recommendations | Correct column order, add birth_date for enrollment matching | ACCEPT |
| Added `updated_by` audit column | Track who modified records | ACCEPT |
| Documented inactive enrollment RLS behavior | Clarify audit trail preservation intent | ACCEPT |

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

### D3. ADR-015 Pattern C RLS with auth.uid() Guard (CORRECTED in v7)

All RLS policies MUST include `(select auth.uid()) IS NOT NULL` as the first condition per ADR-015 Pattern C and SEC-001 Template 1. This ensures policies only evaluate for authenticated user sessions, while service-role operations correctly bypass RLS entirely.

---

## MVP Scope

### In Scope (MVP)

| Component | Description |
|-----------|-------------|
| `player` extension | Add `middle_name`, `email`, `phone_number` columns |
| `player_identity` table | Scanner-shaped ID document metadata (casino-scoped) |
| `player_casino` extension | Add `enrolled_by` column + `UNIQUE (casino_id, player_id)` constraint |
| Manual enrollment flow | Staff-entered data populates scanner-shaped fields |
| ADR-015 compliant RLS | Pattern C with auth.uid() guard |

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

**Privacy Model (Multi-Property Patrons):** Player core identity (name, DOB) is visible to staff at ANY casino where the patron is enrolled. This supports multi-property loyalty programs while preventing duplicate patron records. Enrollment relationship details (`player_casino`) remain casino-scoped.

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
| `document_number_last4` | text | NULL | Last 4 digits for display/verbal verification |
| `document_number_hash` | text | NULL | SHA-256 hash for deduplication (computed from scanner: `documentNumber`) |
| `issue_date` | date | NULL | scanner: `issueDate` |
| `expiration_date` | date | NULL | scanner: `expirationDate` |
| `issuing_state` | text | NULL | scanner: `issuingState` |
| **System Fields** | | | |
| `document_type` | text | NULL | 'drivers_license', 'passport', 'state_id' |
| `verified_at` | timestamptz | NULL | When identity was verified |
| `verified_by` | uuid | NULL, FK → staff | Who verified |
| `created_at` | timestamptz | NOT NULL, default now() | Creation timestamp |
| `updated_at` | timestamptz | NOT NULL, default now() | Last update |
| `created_by` | uuid | NOT NULL, FK → staff | Actor tracking (immutable) |
| `updated_by` | uuid | NULL, FK → staff | Who last modified (set from app.actor_id) |

**Constraints:**
- `UNIQUE (casino_id, player_id)` — One identity per enrollment (implicitly creates index)
- `UNIQUE (casino_id, document_number_hash) WHERE document_number_hash IS NOT NULL` — Prevent duplicate document enrollments per casino
- `FK (casino_id, player_id) REFERENCES player_casino(casino_id, player_id) ON DELETE CASCADE ON UPDATE CASCADE` — INV-2 enforcement

**Recommended Indexes:**
```sql
-- player: enrollment matching (first_name, last_name, birth_date)
-- NOTE: ix_player_names_lower already exists from 20251129230733_prd003_player_visit_rls.sql
-- Do NOT create duplicate ix_player_last_first index
CREATE INDEX ix_player_enrollment_match
  ON player (lower(first_name), lower(last_name), birth_date)
  WHERE birth_date IS NOT NULL;

-- player_identity: UNIQUE constraints already create indexes
-- (Postgres handles this automatically for UNIQUE constraint)

-- player_identity: deduplication by document hash
CREATE UNIQUE INDEX ux_player_identity_doc_hash
  ON player_identity (casino_id, document_number_hash)
  WHERE document_number_hash IS NOT NULL;

-- player_casino: list active enrollments by casino
CREATE INDEX ix_player_casino_active ON player_casino(casino_id, status) WHERE status = 'active';
```

**Triggers (required):**
```sql
-- updated_at auto-update trigger
CREATE OR REPLACE FUNCTION update_player_identity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  -- Set updated_by from RLS context (INV-9 actor binding)
  NEW.updated_by := COALESCE(
    NULLIF(current_setting('app.actor_id', true), '')::uuid,
    NEW.updated_by
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_player_identity_updated_at
  BEFORE UPDATE ON player_identity
  FOR EACH ROW
  EXECUTE FUNCTION update_player_identity_updated_at();

-- Key field immutability enforcement (INV-10)
CREATE OR REPLACE FUNCTION enforce_player_identity_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Reject casino_id mutation (tenant boundary)
  IF OLD.casino_id IS DISTINCT FROM NEW.casino_id THEN
    RAISE EXCEPTION 'player_identity.casino_id is immutable (old: %, attempted: %)',
      OLD.casino_id, NEW.casino_id
    USING ERRCODE = '23514'; -- check_violation
  END IF;

  -- Reject player_id mutation (identity ownership)
  IF OLD.player_id IS DISTINCT FROM NEW.player_id THEN
    RAISE EXCEPTION 'player_identity.player_id is immutable (old: %, attempted: %)',
      OLD.player_id, NEW.player_id
    USING ERRCODE = '23514';
  END IF;

  -- Reject created_by mutation (audit trail protection)
  IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'player_identity.created_by is immutable (audit trail protection)'
    USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_player_identity_immutability
  BEFORE UPDATE ON player_identity
  FOR EACH ROW
  EXECUTE FUNCTION enforce_player_identity_immutability();
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

**CRITICAL: Constraint Required for FK (v7 addition):**
```sql
-- REQUIRED: Add UNIQUE constraint for player_identity FK reference
-- Current PK is (player_id, casino_id) but FK needs (casino_id, player_id)
ALTER TABLE player_casino
  ADD CONSTRAINT uq_player_casino_casino_player
  UNIQUE (casino_id, player_id);
```

This constraint is REQUIRED because:
- Current PK column order is `(player_id, casino_id)`
- `player_identity` FK references `(casino_id, player_id)` (semantic: casino-scoped identity)
- PostgreSQL requires exact column order match for FK → UNIQUE/PK

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
| `documentNumber` | `document_number_hash` + `document_number_last4` | `player_identity` (hashed on ingestion) |
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
   └─ MVP-ACCEPTABLE: duplicates possible if no contact info; tracked as tech debt
   └─ If no match: INSERT into player
   └─ Returns player_id

2. Ensure casino enrollment (CasinoService) ← BOUNDED CONTEXT
   └─ Call CasinoService.enrollPlayer(casino_id, player_id, enrolled_by)
   └─ UPSERT player_casino (casino_id, player_id, status='active', enrolled_by)
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
| Create enrollment | **CasinoService** | `CasinoService.enrollPlayer()` |
| Attach identity | PlayerService | `PlayerService.upsertIdentity()` |

**Key:** PlayerService MUST NOT write to `player_casino` directly. Enrollment is a CasinoService concern.

### Bounded Context Enforcement (v7 addition)

**SLAD COMPLIANCE REQUIREMENT:**

The current codebase has a bounded context violation where `PlayerService.enrollPlayer()` writes directly to `player_casino`. This MUST be corrected:

1. **Move `enrollPlayer()` to CasinoService:**
   ```typescript
   // services/casino/crud.ts (CORRECT location)
   export async function enrollPlayer(
     supabase: SupabaseClient<Database>,
     playerId: string,
     casinoId: string,
     enrolledBy?: string
   ): Promise<PlayerEnrollmentDTO>
   ```

2. **Remove from PlayerService:**
   - Delete `enrollPlayer()` from `services/player/crud.ts`
   - Keep read-only `getEnrollment()` for cross-context DTO consumption

3. **Update route handlers and server actions:**
   - Import `enrollPlayer` from CasinoService
   - Call `CasinoService.enrollPlayer()` for enrollment operations

**SLAD Guardrail:** CI/lint gates should check for unauthorized imports of `player_casino` table types or direct query usage outside CasinoService.

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

**Enforcement:** FK constraint on `player_identity(casino_id, player_id)` → `player_casino(casino_id, player_id)` with `ON DELETE CASCADE`.

### INV-6 RLS UPDATE must include WITH CHECK (PRESERVED)

All UPDATE policies must include WITH CHECK mirroring USING to prevent scope mutation.

### INV-7 Authentication Guard (NEW in v7)

All RLS policies MUST include `(select auth.uid()) IS NOT NULL` as the first condition. This ensures:
1. Policies only evaluate for authenticated user sessions
2. Service-role operations correctly bypass RLS entirely
3. Connection pooling compatibility (wrapped function calls)

### INV-9 Actor Binding for Audit Columns (NEW in v7.1)

RLS INSERT/UPDATE policies MUST bind audit columns (`created_by`, `verified_by`, `enrolled_by`) to `app.actor_id` via WITH CHECK constraints. This prevents clients from forging audit attribution to different staff members.

**Pattern:**
```sql
AND created_by = COALESCE(
  NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
  ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
)
```

### INV-10 Key Field Immutability (NEW in v7.1)

Key enrollment fields (`casino_id`, `player_id`, `created_by`) on `player_identity` are immutable after creation. A BEFORE UPDATE trigger enforces this constraint to prevent identity record swapping within the same casino.

**Protected Fields:**
- `casino_id` — Tenant boundary
- `player_id` — Identity ownership
- `created_by` — Audit trail origin

### Deferred Invariants (Post-MVP)

- INV-3: Least privilege separation (tax identity) — N/A for MVP
- INV-4: Tax ID reveal auditing — N/A for MVP
- INV-5: Key management — N/A for MVP
- INV-8: Identity writes audited — OPTIONAL for MVP, REQUIRED when tax identity added

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

**MANDATORY: Authentication Guard (v7 correction)**

All RLS policies MUST include `(select auth.uid()) IS NOT NULL` as the first condition per ADR-015 Pattern C and SEC-001 Template 1. This guard:

1. **Ensures policies only evaluate for authenticated user sessions** — not for service-role operations
2. **Enables connection pooling compatibility** — wrapped function calls prevent `auth_rls_initplan` warnings
3. **Allows service-role operations to correctly bypass RLS** — service keys skip RLS entirely by design

**Why this is correct:**
- `auth.uid()` returns the Supabase `auth.users.id` (authentication identity)
- `staff.id` is a separate UUID linked via `staff.user_id`
- The guard verifies authentication, NOT staff.id equality
- Service-role clients (`createServiceClient()`) bypass RLS entirely — no policies evaluated

### player_identity

```sql
-- Enable RLS on new table
ALTER TABLE player_identity ENABLE ROW LEVEL SECURITY;

-- Read: pit_boss, admin, cashier can read identity in their casino
CREATE POLICY "player_identity_select" ON player_identity
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin', 'cashier')
  );

-- Insert: pit_boss, admin can create identity (INV-9: actor binding)
CREATE POLICY "player_identity_insert" ON player_identity
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
    -- INV-9: Bind created_by to current actor (prevents audit column spoofing)
    AND created_by = COALESCE(
      NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
    )
  );

-- Update: pit_boss, admin can update identity (INV-6: WITH CHECK mirrors USING, INV-9: actor binding)
CREATE POLICY "player_identity_update" ON player_identity
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
    -- INV-9: If verified_by is being set, bind to current actor
    AND (
      verified_by IS NULL
      OR verified_by = COALESCE(
        NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
  );

-- Delete: Explicit denial (soft-delete only, audit trail preservation)
CREATE POLICY "player_identity_no_delete" ON player_identity
  FOR DELETE USING (false);
```

### player (RLS - KEEP EXISTING ENROLLMENT-FILTERED POLICY)

**IMPORTANT (v7 decision):** The v6 proposal for role-only gate was REJECTED by audit panel (6/8 vote). The existing enrollment-filtered policy from `20251220164609_rls_performance_optimization.sql` is MORE secure and MUST be retained.

`player` is a global table (not casino-scoped). However, RLS uses enrollment filtering to prevent cross-casino player enumeration.

```sql
-- Existing table: verify RLS is enabled
ALTER TABLE player ENABLE ROW LEVEL SECURITY;

-- KEEP EXISTING enrollment-filtered policy (DO NOT use role-only gate)
-- The following is the CORRECT pattern from production:

CREATE POLICY "player_select_enrolled" ON player
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
      AND pc.casino_id = COALESCE(
        NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
  );

-- Write: pit_boss, admin only (enrollment-filtered)
CREATE POLICY "player_insert" ON player
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

CREATE POLICY "player_update_enrolled" ON player
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM player_casino pc
      WHERE pc.player_id = player.id
      AND pc.casino_id = COALESCE(
        NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
      )
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  );

-- Delete: Explicit denial (audit trail preservation)
CREATE POLICY "player_no_delete" ON player
  FOR DELETE USING (false);
```

### player_casino (RLS with enrolled_by support)

`player_casino` is casino-scoped. New `enrolled_by` column requires policy support.

```sql
-- Verify RLS is enabled (existing table)
ALTER TABLE player_casino ENABLE ROW LEVEL SECURITY;

-- SELECT: Keep existing policy (staff in same casino)
CREATE POLICY "player_casino_select_same_casino" ON player_casino
  FOR SELECT USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- INSERT: pit_boss, admin can enroll (INV-9: actor binding for enrolled_by)
CREATE POLICY "player_casino_insert" ON player_casino
  FOR INSERT WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
    -- INV-9: Bind enrolled_by to current actor (NULL allowed for legacy backfill)
    AND (
      enrolled_by IS NULL
      OR enrolled_by = COALESCE(
        NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
  );

-- UPDATE: pit_boss, admin can modify enrollment (status, enrolled_by backfill) (INV-9: actor binding)
CREATE POLICY "player_casino_update" ON player_casino
  FOR UPDATE
  USING (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF((select current_setting('app.casino_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'casino_id')::uuid
    )
    AND COALESCE(
      NULLIF((select current_setting('app.staff_role', true)), ''),
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_role')
    ) IN ('pit_boss', 'admin')
    -- INV-9: If enrolled_by is being changed, must be current actor
    AND (
      enrolled_by IS NULL
      OR enrolled_by = COALESCE(
        NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
  );

-- DELETE: Explicit denial (enrollment is ledger, soft-delete only)
CREATE POLICY "player_casino_no_delete" ON player_casino
  FOR DELETE USING (false);
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
- Identity remains in database (soft retention for audit trail)
- **RLS policies do NOT filter by status** — inactive enrollments remain visible to authorized staff (pit_boss, admin, cashier) within same casino
- **Rationale:** Audit trail preservation, dispute resolution, compliance reporting
- **Application-layer filtering:** Service queries MAY filter `WHERE status = 'active'` when listing active players, but historical/search queries include inactive
- **Re-activation:** Pit boss or admin can `UPDATE player_casino SET status = 'active'` to restore enrollment

**Current RLS behavior (compliant with SEC-001 Template 1):**
```sql
-- player_casino SELECT: Returns ALL enrollments for same casino (active + inactive)
-- NO status filter — audit trail preservation is intentional
```

**Application-layer pattern (when active-only needed):**
```typescript
// List active players only
const { data } = await supabase
  .from('player_casino')
  .select('*')
  .eq('casino_id', casinoId)
  .eq('status', 'active'); // Application filter, not RLS
```

### Deletion

- Hard deletes are NOT supported in MVP (enforced via `USING (false)` DELETE policies)
- Soft deactivation only for audit trail preservation
- `player_identity` cascades with `player_casino` deletion (FK ON DELETE CASCADE)

---

## Migration Path to Full Compliance (Post-MVP)

When tax compliance features are needed:

1. **Add `compliance` to `staff_role` enum**
2. **Create `player_tax_identity` table** (per v5 spec)
3. **Implement tax RPCs** (`reveal_tax_id`, `upsert_tax_identity`)
4. **Add audit logging** for tax operations (INV-4, INV-8)
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

### A4. Use role-only gate for player table (v6 proposal)

**Rejected (v7):** Audit panel voted 6/8 to keep existing enrollment-filtered policy. Role-only gate would allow cross-casino player enumeration, weakening security.

---

## Consequences

### Positive

- **Reduced complexity:** No encryption, compliance roles, or audit infrastructure for MVP
- **Faster delivery:** Focus on core enrollment workflow
- **Extensible:** Clean migration path to full compliance when needed
- **Casino-scoped:** Aligns with existing RLS patterns
- **ADR-015 compliant:** All policies use Pattern C with auth.uid() guard

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
| Document number full encryption | High | Before processing first CTR — add encrypted storage + `reveal_document_number()` RPC with audit trail |
| Player matching merge workflow | Medium | First duplicate complaint — add merge tooling for no-contact duplicate cases |
| Move enrollPlayer() to CasinoService | High | Before production (SLAD fix) |

---

## Implementation Artifacts

### Migrations (to be created)

```
supabase/migrations/YYYYMMDDHHMMSS_adr022_player_contact_columns.sql
supabase/migrations/YYYYMMDDHHMMSS_adr022_player_enrollment_index.sql
supabase/migrations/YYYYMMDDHHMMSS_adr022_player_casino_enrolled_by.sql
supabase/migrations/YYYYMMDDHHMMSS_adr022_player_identity_mvp.sql
supabase/migrations/YYYYMMDDHHMMSS_adr022_identity_immutability_trigger.sql
```

### Migration Ordering (CRITICAL)

The FK `(casino_id, player_id) → player_casino` enforces **migration ordering**:

**Correct Sequence:**

1. **`YYYYMMDDHHMMSS_adr022_player_contact_columns.sql`**
   - Add `middle_name`, `email`, `phone_number` to `player`
   - Add indexes for contact lookup

2. **`YYYYMMDDHHMMSS_adr022_player_enrollment_index.sql`**
   - Add `ix_player_enrollment_match(lower(first_name), lower(last_name), birth_date)`
   - Optimizes enrollment matching queries

3. **`YYYYMMDDHHMMSS_adr022_player_casino_enrolled_by.sql`** (MUST run before step 4)
   - Add `enrolled_by uuid FK → staff(id)` column
   - **Add `UNIQUE (casino_id, player_id)` constraint** (REQUIRED for player_identity FK)
   - No backfill required (NULL for legacy)

4. **`YYYYMMDDHHMMSS_adr022_player_identity_mvp.sql`**
   - Create `player_identity` table with hash + last4 document storage
   - FK constraint: `(casino_id, player_id) → player_casino(casino_id, player_id) ON DELETE CASCADE`
   - Enable RLS with corrected policies including INV-9 actor binding
   - Create `updated_at` trigger with `updated_by` auto-population
   - Add DELETE denial policy
   - Add `ux_player_identity_doc_hash` unique index for deduplication

5. **`YYYYMMDDHHMMSS_adr022_identity_immutability_trigger.sql`**
   - Create `enforce_player_identity_immutability()` function
   - Add BEFORE UPDATE trigger (INV-10)
   - Protects `casino_id`, `player_id`, `created_by` from mutation

**BLOCKING DEPENDENCY:**
- Migration 3 MUST complete before Migration 4
- The `UNIQUE (casino_id, player_id)` constraint is REQUIRED for the FK to work
- PK `(player_id, casino_id)` column order differs from FK reference order
- Migration 5 MUST run after Migration 4 (trigger references table)

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
├── crud.ts          # Add identity CRUD (NOT enrollPlayer!)
└── index.ts         # Export identity functions

services/casino/
├── crud.ts          # Add enrollPlayer() here (SLAD fix)
└── index.ts         # Export enrollPlayer
```

---

## Acceptance Criteria (MVP)

### Schema
- [ ] `player` table has `middle_name`, `email`, `phone_number` columns
- [ ] `player_casino` table has `enrolled_by uuid FK → staff` column
- [ ] `player_casino` table has `UNIQUE (casino_id, player_id)` constraint
- [ ] `player_identity` table exists with enrollment-scoped uniqueness (casino_id, player_id)
- [ ] FK constraint enforces enrollment prerequisite with ON DELETE CASCADE (INV-2)

### Security
- [ ] All RLS policies include `(select auth.uid()) IS NOT NULL` guard (INV-7)
- [ ] All UPDATE policies include WITH CHECK clause mirroring USING (INV-6)
- [ ] Explicit DELETE denial policies on player, player_identity, player_casino
- [ ] Dealer cannot access player_identity
- [ ] player table uses enrollment-filtered policy (not role-only)
- [ ] `created_by`/`enrolled_by`/`verified_by` bound to `app.actor_id` (INV-9)
- [ ] Key field immutability trigger prevents `casino_id`/`player_id`/`created_by` mutation (INV-10)
- [ ] `document_number` stored as hash + last4 only (no plaintext)
- [ ] UI masks document number input field
- [ ] Deduplication works via `document_number_hash` matching

### Bounded Context
- [ ] `enrollPlayer()` is in CasinoService (not PlayerService)
- [ ] PlayerService owns `player` + `player_identity` writes only
- [ ] Enrollment flow respects: player → player_casino → player_identity sequence

### Compliance
- [ ] RLS policies pass SEC-001 Template 1 validation
- [ ] Policies use ADR-015 Pattern C with `(select ...)` wrappers
- [ ] No tax-related tables or RPCs in MVP

---

## References

### Internal Documentation

- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — Bounded context ownership
- `docs/30-security/SEC-001-rls-policy-matrix.md` — RLS policy templates
- `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` — Pattern C (Hybrid) RLS

### Audit Trail

- **8-Agent RLS Audit (2025-12-23):** Unanimous vote on auth.uid() guard, FK constraint fix
- **Majority decisions:** DELETE policies, enrollment-filtered player policy, SLAD enforcement
- **7-Agent Security Audit (2025-12-23):** Applied fixes for actor binding, document hash storage, key immutability, index optimization, inactive enrollment documentation

### Superseded

- `docs/80-adrs/ADR-022_Player_Identity_Enrollment_ARCH_v6.md` — Pre-audit version (security issues identified)
- `docs/80-adrs/ADR-022_Player_Identity_Enrollment_ARCH_v5.md` — Full compliance scope (retained for future reference)
