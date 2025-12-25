---
id: ADR-022
title: Player Identity & Enrollment Architecture - Durable Decisions
version: 8.0
owner: Architecture
status: Frozen
date: 2025-12-24
deciders: Lead Architect
affects: [PlayerService, CasinoService, SEC-001, ADR-015]
supersedes: ADR-022 v7.1 (refactored into Decision + Exec Spec + DoD)
---

# ADR-022: Player Identity & Enrollment Architecture (Decisions Only)

**Status:** Frozen (Decision Record Only)
**Date:** 2025-12-24
**Affects:** PlayerService, CasinoService, SEC-001, ADR-015

> **This document contains DURABLE DECISIONS only.** Implementation details (RLS policies, triggers, indexes, migrations) live in **EXEC-SPEC-022**. Validation gates live in **DOD-022**.

---

## Context

Floor supervisors must enroll patrons into the player tracking system. The MVP requires capturing basic identity information from government-issued ID documents to support enrollment and player identification workflows.

**MVP Reality:**
- Tax compliance features (SSN/TIN, CTR thresholds) are **not required for initial launch**
- ID scanner integration is **planned but deferred** — ingestion will be manual until scanner is wired
- Schema is scanner-shaped — fields align with AAMVA scanner output
- Existing `player` table is intentionally minimal and needs extension

---

## Durable Decisions

### D1. Identity Scope is Casino-Scoped Enrollment

Identity is a property of a patron's enrollment **at a casino**, not a single global identity record.

**Result:** Identity storage is keyed by `(casino_id, player_id)`.

**Why durable:** This is a data model foundation. Changing it requires rewriting the entire identity storage architecture.

---

### D2. Split Player Core from Identity Artifacts

For MVP, we implement a pragmatic two-table model:

| Table | Purpose | Owner |
|-------|---------|-------|
| `player` | Core patron record (names, DOB, contact info) | PlayerService |
| `player_identity` | ID document metadata (address, doc fields) | PlayerService |
| `player_casino` | Enrollment relationship | CasinoService |

**Deferred to post-MVP:**
- `player_tax_identity` — SSN/TIN storage with RPC-gated access
- `player_identity_scan` — Raw scanner payload storage

**Why durable:** Table boundaries define bounded context ownership. Changing them requires service refactoring.

---

### D3. ADR-015 Pattern C (Hybrid RLS with Fallback)

All RLS policies use Pattern C (Hybrid with Fallback) per ADR-015:
- First preference: `current_setting('app.X', true)` (transaction-local)
- Fallback: `auth.jwt() -> 'app_metadata' ->> 'X'` (JWT claims)

**Why durable:** RLS pattern affects all policies across the system. Changing it requires coordinated migration.

---

### D4. Document Number Stored as Hash + Last4 (No Plaintext)

Government ID document numbers are stored as:
- `document_number_hash` — SHA-256 hash for deduplication
- `document_number_last4` — Last 4 digits for display/verbal verification

**No plaintext document numbers in database.**

**Why durable:** This is a security architecture decision affecting breach impact and compliance posture.

---

### D5. Actor Binding is Database-Enforced

Audit columns (`created_by`, `enrolled_by`, `verified_by`, `updated_by`) are bound to `app.actor_id` via:
1. RLS WITH CHECK constraints (INSERT/UPDATE)
2. BEFORE UPDATE triggers (for `updated_by` auto-population)

Clients cannot forge audit attribution.

**Why durable:** Moving enforcement to application layer would be a security regression.

---

### D6. Key Field Immutability is Trigger-Enforced

Key enrollment fields on `player_identity` are immutable after creation:
- `casino_id` — Tenant boundary
- `player_id` — Identity ownership
- `created_by` — Audit trail origin

Enforced via BEFORE UPDATE trigger (RLS cannot enforce column-level constraints).

**Why durable:** Trigger enforcement is more reliable than application-layer checks.

---

### D7. Enrollment Prerequisite via FK Constraint

Identity rows MUST NOT exist unless a matching enrollment exists in `player_casino(casino_id, player_id)`.

**Enforcement:** FK constraint with `ON DELETE CASCADE`.

**Why durable:** Database constraints are more reliable than application-layer checks.

---

## Security Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| **INV-1** | Casino context binding — `casino_id` derived from session/JWT, never trusted from caller | RLS policies |
| **INV-2** | Enrollment prerequisite — identity rows require matching enrollment | FK constraint |
| **INV-6** | UPDATE policies must include WITH CHECK mirroring USING | RLS policies |
| **INV-7** | Authentication guard — `(select auth.uid()) IS NOT NULL` in all policies | RLS policies |
| **INV-9** | Actor binding — audit columns bound to `app.actor_id` | RLS WITH CHECK |
| **INV-10** | Key immutability — `casino_id`, `player_id`, `created_by` cannot mutate | BEFORE UPDATE trigger |

---

## Bounded Context Ownership

**SRM Alignment (normative):**

| Service | Owns | Responsibility |
|---------|------|----------------|
| **CasinoService** | `player_casino` | Enrollment relationship (who is enrolled where) |
| **PlayerService** | `player`, `player_identity` | Identity artifacts (who is this person) |

**Rule:** PlayerService MUST NOT write directly to `player_casino`. Enrollment is orchestrated via CasinoService API.

---

## Access Control Matrix (MVP)

### player_identity

| Role | Read | Write | Notes |
|------|------|-------|-------|
| `pit_boss` | Yes | Yes | Primary enrollment role |
| `admin` | Yes | Yes | Full access |
| `cashier` | Yes | No | Read-only (verification) |
| `dealer` | No | No | No access to PII |

### player (core)

| Role | Read | Write | Notes |
|------|------|-------|-------|
| `pit_boss` | Yes | Yes | Create/update players |
| `admin` | Yes | Yes | Full access |
| `cashier` | Yes | No | Read for transactions |
| `dealer` | No | No | No direct player access |

---

## Explicitly Deferred (Post-MVP)

| Component | Reason | Tracking |
|-----------|--------|----------|
| `player_tax_identity` | Tax compliance not required for launch | Future PRD |
| `player_identity_scan` | Scanner integration planned, not MVP | Future PRD |
| SSN/TIN storage/reveal | Requires encryption, audit infrastructure | Future PRD |
| CTR threshold enforcement | Finance/MTL integration deferred | Future PRD |
| `compliance` role | Not needed until tax features | Future PRD |
| Vault/pgsodium encryption | Deferred with tax identity | Future PRD |

---

## Alternatives Considered

### A1. Implement full tax compliance scope immediately
**Rejected:** Over-engineering for MVP. Tax features add significant complexity without immediate business value.

### A2. Put identity fields directly on player table
**Rejected:** `player` is global; identity fields are casino-scoped enrollment data.

### A3. Skip player_identity entirely
**Rejected:** ID document metadata (address, issuing state, expiration) is casino-specific enrollment data.

### A4. Use role-only gate for player table
**Rejected (v7):** Audit panel voted 6/8 to keep enrollment-filtered policy.

### A5. Store plaintext document numbers
**Rejected (v7.1):** Hash + last4 reduces breach impact while preserving deduplication capability.

---

## References

| Document | Purpose |
|----------|---------|
| **EXEC-SPEC-022** | Implementation details (RLS policies, triggers, indexes, migrations) |
| **DOD-022** | Executable gate checklist |
| **Feature Boundary** | Scope definition |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Bounded context ownership |
| `docs/30-security/SEC-001-rls-policy-matrix.md` | RLS policy templates |
| `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` | Pattern C (Hybrid) RLS |

---

## Document History

| Version | Date | Change |
|---------|------|--------|
| 8.0 | 2025-12-24 | **FROZEN** — Refactored into Decisions + Exec Spec + DoD per PT-2 Feature Pipeline |
| 7.1 | 2025-12-23 | Security audit fixes (INV-9, INV-10, document hash) |
| 7.0 | 2025-12-23 | 8-agent RLS audit fixes |
| 6.0 | 2025-12-22 | MVP scope adoption |

---

**Gate:** If it can change next sprint with low fallout, it's not an ADR.
