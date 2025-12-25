---
spec: EXEC-SPEC-022
feature: player-identity-enrollment
service: PlayerService
adr: ADR-022_Player_Identity_Enrollment_DECISIONS.md
dod_file: docs/20-architecture/specs/ADR-022/DOD-022.md

workstreams:
  WS1:
    name: Database Layer (Schema + Indexes + Triggers)
    agent: backend-developer
    depends_on: []
    sections: [1, 2, 3]
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_adr022_player_contact_columns.sql
      - supabase/migrations/YYYYMMDDHHMMSS_adr022_player_enrollment_index.sql
      - supabase/migrations/YYYYMMDDHHMMSS_adr022_player_casino_enrolled_by.sql
      - supabase/migrations/YYYYMMDDHHMMSS_adr022_player_identity_mvp.sql
      - supabase/migrations/YYYYMMDDHHMMSS_adr022_identity_immutability_trigger.sql
    gate: schema-validation
    critical: true

  WS2:
    name: RLS Policies (Security Layer)
    agent: rls-security-specialist
    depends_on: [WS1]
    sections: [4]
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_adr022_player_identity_rls.sql
      - supabase/migrations/YYYYMMDDHHMMSS_adr022_delete_denial_policies.sql
      - __tests__/rls/player-identity.test.ts
    gate: test-pass
    critical: true

  WS3:
    name: Service Layer (Identity + Enrollment)
    agent: backend-developer
    depends_on: [WS1]
    sections: [8]
    outputs:
      - services/player/identity.ts
      - services/player/dtos.ts (update)
      - services/player/schemas.ts (update)
      - services/casino/crud.ts (enrollPlayer move)
      - services/player/crud.ts (enrollPlayer remove)
    gate: type-check

  WS4:
    name: UI Components (Document Input)
    agent: pt2-frontend-implementer
    depends_on: [WS3]
    sections: [9]
    outputs:
      - components/enrollment/document-input.tsx
      - components/enrollment/identity-form.tsx
    gate: lint

  WS5:
    name: Integration Tests (DoD Gates)
    agent: backend-developer
    depends_on: [WS2, WS3]
    sections: []
    outputs:
      - __tests__/integration/player-identity.test.ts
      - __tests__/constraints/player-identity.test.ts
    gate: test-pass
    dod_reference: DOD-022.md

  WS6:
    name: SLAD Compliance (Bounded Context)
    agent: backend-developer
    depends_on: [WS3]
    sections: []
    outputs:
      - __tests__/slad/player-identity-ownership.test.ts
    gate: slad-pass
    critical: true
    dod_reference: DOD-022.md#B7

execution_phases:
  - parallel: [WS1]
  - parallel: [WS2, WS3]
  - parallel: [WS4, WS5, WS6]

gates:
  schema-validation:
    command: npm run db:types
    description: Types generate without error
  type-check:
    command: npm run type-check
    description: No TypeScript errors
  lint:
    command: npm run lint
    description: ESLint passes
  test-pass:
    command: npm test -- -t "player-identity"
    description: All player-identity tests pass
  slad-pass:
    command: npm test -- -t "Bounded Context Ownership"
    description: SLAD ownership tests pass
---

# EXEC-SPEC-022: Player Identity Enrollment Implementation

> **Purpose:** Convert ADR-022 durable decisions into concrete implementation details. This document is MUTABLE — it can change as implementation evolves.

---

## Feature Boundary Reference

See `FEATURE_BOUNDARY.md` for scope definition and ownership.

---

## 1. Schema Changes

### 1.1 player (Extended)

Add optional columns (scanner-aligned):

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| `middle_name` | text | NULL | scanner: `middleName` |
| `email` | text | NULL | Optional contact |
| `phone_number` | text | NULL | Optional contact |

### 1.2 player_casino (Extended)

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| `enrolled_by` | uuid | NULL, FK → staff | Who enrolled (actor tracking) |

**Required Constraint:**
```sql
ALTER TABLE player_casino
  ADD CONSTRAINT uq_player_casino_casino_player
  UNIQUE (casino_id, player_id);
```

**Why:** FK from `player_identity` references `(casino_id, player_id)`. PK column order `(player_id, casino_id)` differs from FK reference order.

### 1.3 player_identity (NEW)

| Column | Type | Constraint | Notes |
|--------|------|------------|-------|
| `id` | uuid | PK, default gen_random_uuid() | Row identifier |
| `casino_id` | uuid | NOT NULL, FK → casino | Casino scoping |
| `player_id` | uuid | NOT NULL | Player reference |
| `birth_date` | date | NULL | DOB from ID document |
| `gender` | text | NULL, CHECK IN ('m','f','x') | lowercase |
| `eye_color` | text | NULL | |
| `height` | text | NULL | Format: "6-01" |
| `weight` | text | NULL | |
| `address` | jsonb | NULL | Structured address |
| `document_number_last4` | text | NULL | Last 4 for display |
| `document_number_hash` | text | NULL | SHA-256 for deduplication |
| `issue_date` | date | NULL | |
| `expiration_date` | date | NULL | |
| `issuing_state` | text | NULL | |
| `document_type` | text | NULL | 'drivers_license', 'passport', 'state_id' |
| `verified_at` | timestamptz | NULL | |
| `verified_by` | uuid | NULL, FK → staff | |
| `created_at` | timestamptz | NOT NULL, default now() | |
| `updated_at` | timestamptz | NOT NULL, default now() | |
| `created_by` | uuid | NOT NULL, FK → staff | Immutable |
| `updated_by` | uuid | NULL, FK → staff | Set from app.actor_id |

**Constraints:**
- `UNIQUE (casino_id, player_id)` — One identity per enrollment
- `UNIQUE (casino_id, document_number_hash) WHERE document_number_hash IS NOT NULL`
- `FK (casino_id, player_id) REFERENCES player_casino(casino_id, player_id) ON DELETE CASCADE`

---

## 2. Indexes

```sql
-- player: enrollment matching
CREATE INDEX ix_player_enrollment_match
  ON player (lower(first_name), lower(last_name), birth_date)
  WHERE birth_date IS NOT NULL;

-- player_identity: deduplication by document hash
CREATE UNIQUE INDEX ux_player_identity_doc_hash
  ON player_identity (casino_id, document_number_hash)
  WHERE document_number_hash IS NOT NULL;

-- player_casino: list active enrollments
CREATE INDEX ix_player_casino_active
  ON player_casino(casino_id, status)
  WHERE status = 'active';
```

---

## 3. Triggers

### 3.1 updated_at + updated_by Auto-Population

```sql
CREATE OR REPLACE FUNCTION update_player_identity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
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
```

### 3.2 Key Field Immutability (INV-10)

```sql
CREATE OR REPLACE FUNCTION enforce_player_identity_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.casino_id IS DISTINCT FROM NEW.casino_id THEN
    RAISE EXCEPTION 'player_identity.casino_id is immutable'
    USING ERRCODE = '23514';
  END IF;

  IF OLD.player_id IS DISTINCT FROM NEW.player_id THEN
    RAISE EXCEPTION 'player_identity.player_id is immutable'
    USING ERRCODE = '23514';
  END IF;

  IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'player_identity.created_by is immutable'
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

---

## 4. RLS Policies

### 4.1 player_identity

```sql
ALTER TABLE player_identity ENABLE ROW LEVEL SECURITY;

-- SELECT: pit_boss, admin, cashier can read in their casino
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

-- INSERT: pit_boss, admin with actor binding (INV-9)
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
    AND created_by = COALESCE(
      NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
      ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
    )
  );

-- UPDATE: pit_boss, admin with actor binding (INV-6, INV-9)
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
    AND (
      verified_by IS NULL
      OR verified_by = COALESCE(
        NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
  );

-- DELETE: Explicit denial (audit trail)
CREATE POLICY "player_identity_no_delete" ON player_identity
  FOR DELETE USING (false);
```

### 4.2 player_casino (Extended for enrolled_by)

```sql
-- INSERT: pit_boss, admin with actor binding (INV-9)
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
    AND (
      enrolled_by IS NULL
      OR enrolled_by = COALESCE(
        NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
        ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
      )
    )
  );

-- UPDATE: pit_boss, admin with actor binding (INV-9)
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

### 4.3 player (Reference - Existing Policies)

> **NOTE:** Player table RLS policies already exist in migration `20251220164609_rls_performance_optimization.sql`. ADR-022 requires verification that these policies remain compliant.

**Existing policies (verify, do not recreate):**

```sql
-- SELECT: Enrollment-filtered (not role-only gate per audit decision)
-- Policy: player_select_enrolled
-- Pattern: EXISTS (SELECT 1 FROM player_casino pc WHERE pc.player_id = player.id AND pc.casino_id = ...)

-- INSERT: pit_boss, admin only
-- Policy: player_insert_admin

-- UPDATE: Enrollment-filtered + role check
-- Policy: player_update_enrolled

-- DELETE: Must add explicit denial (MISSING - add in migration)
CREATE POLICY "player_no_delete" ON player
  FOR DELETE USING (false);
```

**Migration requirement:** Add `player_no_delete` policy if not present.

---

## 5. Migration Ordering (CRITICAL)

Migrations must execute in this order due to FK dependencies:

| Order | Migration | Purpose |
|-------|-----------|---------|
| 1 | `YYYYMMDDHHMMSS_adr022_player_contact_columns.sql` | Add `middle_name`, `email`, `phone_number` to `player` |
| 2 | `YYYYMMDDHHMMSS_adr022_player_enrollment_index.sql` | Add enrollment matching index |
| 3 | `YYYYMMDDHHMMSS_adr022_player_casino_enrolled_by.sql` | Add `enrolled_by` column + UNIQUE constraint |
| 4 | `YYYYMMDDHHMMSS_adr022_player_identity_mvp.sql` | Create `player_identity` table with RLS |
| 5 | `YYYYMMDDHHMMSS_adr022_identity_immutability_trigger.sql` | Add immutability trigger |
| 6 | `YYYYMMDDHHMMSS_adr022_delete_denial_policies.sql` | Add `player_no_delete`, `player_casino_no_delete` policies |

**BLOCKING DEPENDENCY:** Migration 3 MUST complete before Migration 4 (UNIQUE constraint required for FK).

**Migration 6 contents:**
```sql
-- Add missing DELETE denial policies per ADR-022 security invariants
-- player_identity already has denial in migration 4

-- player: prevent hard deletes (audit trail preservation)
CREATE POLICY "player_no_delete" ON player
  FOR DELETE USING (false);

-- player_casino: prevent hard deletes (enrollment is ledger)
CREATE POLICY "player_casino_no_delete" ON player_casino
  FOR DELETE USING (false);
```

---

## 6. Scanner Field Mapping

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
| `documentNumber` | `document_number_hash` + `document_number_last4` | `player_identity` |
| `issueDate` | `issue_date` | `player_identity` |
| `expirationDate` | `expiration_date` | `player_identity` |
| `issuingState` | `issuing_state` | `player_identity` |

---

## 7. Address JSONB Structure

```typescript
interface IdentityAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}
```

**Nullability:** Address may be partial. Use optional chaining in code.

---

## 8. Service Layer Changes

### 8.1 Document Hash Computation

```typescript
// services/player/identity.ts
import { createHash } from 'crypto';

export function computeDocumentHash(documentNumber: string): string {
  return createHash('sha256')
    .update(documentNumber.toUpperCase().trim())
    .digest('hex');
}

export function extractLast4(documentNumber: string): string {
  const cleaned = documentNumber.replace(/[^A-Z0-9]/gi, '');
  return cleaned.slice(-4);
}
```

### 8.2 Enrollment Flow

```typescript
// services/player/crud.ts
export async function upsertIdentity(
  supabase: SupabaseClient<Database>,
  casinoId: string,
  playerId: string,
  input: PlayerIdentityInput,
  actorId: string
): Promise<PlayerIdentityDTO> {
  const documentHash = input.documentNumber
    ? computeDocumentHash(input.documentNumber)
    : null;
  const documentLast4 = input.documentNumber
    ? extractLast4(input.documentNumber)
    : null;

  const { data, error } = await supabase
    .from('player_identity')
    .upsert({
      casino_id: casinoId,
      player_id: playerId,
      document_number_hash: documentHash,
      document_number_last4: documentLast4,
      created_by: actorId,
      // ... other fields
    }, {
      onConflict: 'casino_id,player_id'
    })
    .select()
    .single();

  if (error) throw mapDatabaseError(error);
  return toPlayerIdentityDTO(data);
}
```

### 8.3 CasinoService.enrollPlayer (SLAD Fix)

Move `enrollPlayer()` from PlayerService to CasinoService:

```typescript
// services/casino/crud.ts
export async function enrollPlayer(
  supabase: SupabaseClient<Database>,
  playerId: string,
  casinoId: string,
  enrolledBy: string
): Promise<PlayerEnrollmentDTO> {
  const { data, error } = await supabase
    .from('player_casino')
    .upsert({
      player_id: playerId,
      casino_id: casinoId,
      enrolled_by: enrolledBy,
      status: 'active'
    }, {
      onConflict: 'player_id,casino_id'
    })
    .select()
    .single();

  if (error) throw mapDatabaseError(error);
  return toPlayerEnrollmentDTO(data);
}
```

---

## 9. UI Changes

### 9.1 Document Number Input Masking

```typescript
// components/enrollment/document-input.tsx
export function DocumentNumberInput({
  value,
  onChange
}: DocumentNumberInputProps) {
  // Never display full document number
  // Show last 4 only after save
  const displayValue = value
    ? '****' + value.slice(-4)
    : '';

  return (
    <Input
      type="password"
      value={value}
      onChange={onChange}
      placeholder="Enter document number"
      autoComplete="off"
    />
  );
}
```

---

## 10. DOB Derivation Rule

- `player_identity.birth_date` = DOB from presented ID document
- `player.birth_date` = canonical DOB for matching/search

**On identity create:** Set `player.birth_date` from `player_identity.birth_date`
**On identity update:** Propagate unless admin has explicitly overridden `player.birth_date`

---

## References

| Document | Purpose |
|----------|---------|
| **ADR-022** | Durable decisions |
| **DOD-022** | Gate checklist |
| **FEATURE_BOUNDARY** | Scope definition |
| `reference-pt-1/types/scanner.ts` | Scanner type definitions |
