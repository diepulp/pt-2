---
prd: ADR-022
prd_title: "Player Identity & Enrollment Architecture (Casino-Scoped, Least-Privilege)"
doc: EXECUTION-SPEC
version: v2
status: Proposed (production-hardening rewrite)
date: 2025-12-23
owner: PlayerService
mvp_phase: 1
---

# EXECUTION-SPEC: ADR-022 (v2 Production Hardening)

This document rewrites **EXECUTION-SPEC-ADR-022.md** into a **production-executable** plan by resolving the primary contradictions and adding the missing “make it enforceable” details (privileges, idempotency, and column-level separation).

## Non-negotiable Decisions

### D0 — Enrollment MVP is NOT Tax/SSN
**Phase 1 enrollment does not store or reveal SSN/ITIN/TIN.**  
Tax identity is a separate Phase 2 deliverable with its own operational controls (break-glass, alerts, legal retention rules). This prevents the MVP from turning into a compliance security program.

### D1 — Scanner payload ≠ Player profile
The ID scanner returns *identity attributes*. We store them in identity tables, not in `player`.

### D2 — Column-level privacy is implemented structurally
Because Postgres RLS is row-level (not column-level), Phase 1 uses **two identity tables**:
- `player_identity` (basic identity attributes, lower sensitivity)
- `player_identity_sensitive` (DOB, address, document metadata)

This is the minimum structural move that actually enforces least privilege without relying on “everyone promises to use the right DTO.”

### D3 — “RPC-only” means privileges are revoked
“RPC-only” is real only if:
- RLS is enabled **and**
- direct table privileges are not accidentally granted in the future.

Phase 1 enforces this with explicit privilege hardening and a regression test gate.

---

## Scope

### In Scope (Phase 1)
- Store & update ID-scanner-derived fields (excluding SSN)
- Casino-scoped enrollment orchestration (player + player_casino + identity upserts)
- Least-privilege read model for front desk / pit vs compliance/admin
- Scan provenance & idempotency (dedupe repeated scans)

### Out of Scope (Phase 1)
- Any storage of SSN/ITIN/TIN
- Any “reveal SSN” RPC
- AML/CTR threshold decisions (Finance/MTL owns)
- Document image storage (if scanner provides images, store in Storage later)

---

## Architecture Context

### Ownership
- `player` remains broadly readable (profile).
- `player_casino` is the enrollment gate (casino-scoped membership).
- `player_identity*` tables are PlayerService-owned, but **must be casino-scoped and enrollment-gated** via `(casino_id, player_id)` FK to `player_casino`.

### RLS Model Assumption
Hybrid RLS + pooling model: per request, application sets session variables (e.g., `app.casino_id`, `app.staff_id`, `app.staff_role`) via a single RPC, and policies use `current_setting(...)` with JWT fallback.

---

## Data Model (Phase 1)

### 1) `player` (existing)
Keep `player` minimal and safe-ish:
- names
- optional contact info (email/phone) **OR** keep contact only in `player_identity_sensitive` — pick one and don’t duplicate.

> Recommendation: keep `email` / `phone_number` on `player` **only** if many flows need it; otherwise store it only in identity-sensitive.

### 2) `player_identity` (basic)
Stores lower-sensitivity attributes that may be needed in pit workflows.

**Columns (suggested):**
- `id uuid pk default gen_random_uuid()`
- `casino_id uuid not null`
- `player_id uuid not null`
- `gender text null` *(or enum if canonical)*
- `eye_color text null`
- `height text null`
- `weight text null`
- `issuing_state text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

**Constraints:**
- `unique (casino_id, player_id)`
- `foreign key (casino_id, player_id) references player_casino(casino_id, player_id) on delete cascade`

### 3) `player_identity_sensitive` (restricted)
Stores DOB, address, and document metadata.

**Columns (suggested):**
- `id uuid pk default gen_random_uuid()`
- `casino_id uuid not null`
- `player_id uuid not null`
- `dob date null`
- `address jsonb null`  *(scanner payload fits; normalize later if needed)*
- `document_number text null` *(optional; consider storing only last4 or hash)*
- `issue_date date null`
- `expiration_date date null`
- `document_type text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

**Constraints:**
- `unique (casino_id, player_id)`
- `foreign key (casino_id, player_id) references player_casino(casino_id, player_id) on delete cascade`

### 4) `player_identity_scan` (provenance + idempotency)
Stores raw scanner payload and parsed fields.

**Columns (suggested):**
- `id uuid pk default gen_random_uuid()`
- `casino_id uuid not null`
- `player_id uuid null` *(set after match/create)*
- `scan_provider text not null`
- `scan_payload jsonb not null`
- `parsed_fields jsonb not null`
- `scan_hash text not null` *(dedupe key)*
- `created_by uuid not null` *(staff.id)*
- `created_at timestamptz not null default now()`

**Constraints:**
- `unique (casino_id, scan_hash)`
- optional index: `(casino_id, created_at desc)`

---

## RLS & Access Control (Phase 1)

### Session Context Helpers (recommended)
Policies rely on:
- `app.casino_id` (uuid)
- `app.staff_id` (uuid)
- `app.staff_role` (text)

Fallback to JWT claims where applicable.

### Read/Write Rules (normative)
- **`player`**: readable by all staff in the casino; writable by admin/pit_boss (per SRM).
- **`player_identity`**: readable by `pit_boss`, `cashier`, `admin`, `compliance` (if role exists).  
- **`player_identity_sensitive`**: readable only by `admin` and `compliance` (or strict subset you choose).
- **`player_identity_scan`**: readable by `admin` and `compliance`; insertable by any staff involved in enrollment; never exposed broadly.

> If you do not currently have a `compliance` staff_role in the canonical enum, Phase 1 uses `admin` only and treats `compliance` as Phase 1.5 migration.

### Enforcement Note (important)
Row policies enforce **who can touch rows**, but table split enforces **who can see sensitive columns** without requiring triggers.

---

## Workstreams

### WS1 — Enum/Role decision (only if needed)
**Goal:** Ensure the role model used in policies exists.

- Option A (recommended): add `compliance` to `staff_role` enum.
- Option B: defer; use `admin` only in Phase 1 and add `compliance` later.

**Gate:** no policy references a role that does not exist.

### WS2 — Migrations: create identity tables (+ constraints)
Deliverables:
- Create `player_identity`
- Create `player_identity_sensitive`
- Create `player_identity_scan`
- Add constraints & indexes
- Add `updated_at` triggers (standardized)

### WS3 — Policies & privilege hardening
Deliverables:
- Enable RLS on new tables
- Create policies per access rules above
- Add a “privilege regression gate”:
  - `select` from sensitive table must fail for pit roles, even if a developer later adds a sloppy policy.

**Implementation rule:** treat “RPC-only” as a Phase 2 pattern; Phase 1 can be direct table access behind RLS, with strict DTOs.

### WS4 — Service layer: Enrollment orchestration
Deliverables:
- `PlayerEnrollmentService.enrollFromScan(...)`:
  1. insert scan row (idempotent via `(casino_id, scan_hash)`)
  2. match existing player or create new player
  3. upsert player_casino
  4. upsert `player_identity` + `player_identity_sensitive`
  5. backfill scan row with `player_id`

**Idempotency:** repeated scan payload produces same result without duplicating rows.

### WS5 — Route handlers
Deliverables:
- `POST /api/player/enroll/scan`
- `GET /api/player/:id/identity` (admin/compliance only)
- `GET /api/player/:id/identity/basic` (pit/cashier allowed)

### WS6 — Tests (must-have for “prod ready”)
Deliverables:
- RLS tests:
  - pit role cannot read sensitive identity
  - admin can read sensitive identity
  - cross-casino access denied (hard tenant boundary)
- Idempotency tests:
  - same scan_hash does not create duplicates
- DTO safety tests:
  - basic endpoint never includes sensitive fields

---

## SQL Sketch (illustrative)

> Keep actual migration SQL in `supabase/migrations/` and align naming to SRM v4 and canonical `database.types.ts`.

```sql
-- identity tables
create table public.player_identity (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null,
  player_id uuid not null,
  gender text,
  eye_color text,
  height text,
  weight text,
  issuing_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (casino_id, player_id),
  foreign key (casino_id, player_id)
    references public.player_casino (casino_id, player_id)
    on delete cascade
);

create table public.player_identity_sensitive (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null,
  player_id uuid not null,
  dob date,
  address jsonb,
  document_number text,
  issue_date date,
  expiration_date date,
  document_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (casino_id, player_id),
  foreign key (casino_id, player_id)
    references public.player_casino (casino_id, player_id)
    on delete cascade
);

create table public.player_identity_scan (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null,
  player_id uuid,
  scan_provider text not null,
  scan_payload jsonb not null,
  parsed_fields jsonb not null,
  scan_hash text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (casino_id, scan_hash)
);
```

---

## Risks & Mitigations

### R1 — You store `document_number` and later regret it
**Mitigation:** store last4 or a salted hash instead; keep full document number out of Phase 1 unless required.

### R2 — Role drift (“compliance” isn’t real)
**Mitigation:** gate policies on enums that exist; if you can’t add the role now, remove it from Phase 1.

### R3 — “We’ll be careful in DTOs” fails over time
**Mitigation:** table split + endpoint split + tests.

---

## Definition of Done (Phase 1)
- Enrollment endpoint creates or matches player and links to casino
- Identity fields from scanner are stored in the correct table(s)
- pit/cashier can access **basic** identity only
- admin (and optionally compliance) can access **sensitive** identity
- RLS tests pass and prove tenant boundary + privilege boundary
- No SSN storage, no SSN reveal RPC exists in Phase 1

---

## Phase 2 Placeholder (Tax Identity)
A separate spec will introduce:
- `player_tax_identity` (separate table)
- encryption-at-rest strategy (DB-managed, not “app-layer but revealed by DB”)
- break-glass reveal controls (rate limits, alerts, approvals)
- audited access with periodic review
