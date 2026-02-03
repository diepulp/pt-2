# TEMP-003: Temporal Governance Enforcement Standard

**Status:** Active
**Version:** 1.1
**Owner:** Lead Architect
**Applies to:** All services, RPCs, triggers, UI surfaces, and RSC pages that read/write by gaming day, casino time, or date ranges
**Last Updated:** 2026-02-02
**Supersedes:** None (enforcement layer for TEMP-001 and TEMP-002)

---

> **This document is the enforcement companion to [TEMP-001](./TEMP-001-gaming-day-specification.md) (specification) and [TEMP-002](./TEMP-002-temporal-authority-pattern.md) (propagation pattern). It converts rules into gates.**
>
> **Registry:** See [INDEX.md](./INDEX.md) for the full temporal pattern registry.

---

## 1. Purpose

TEMP-001 defines the gaming day computation. TEMP-002 defines how temporal authority propagates. Neither document prevented a governance bypass that caused a P0 data-display regression.

This document closes that gap by codifying:

1. **Banned code patterns** with CI/lint enforcement
2. **The only allowed performance path** for RSC surfaces that need gaming day without client waterfalls
3. **Remediation checklist** for the current codebase
4. **Observability tripwires** that detect future rogue bypasses
5. **Definition of Done** for full TEMP-001 compliance

### Antipattern Case Study

The incident that motivated this standard is documented in:

> [`docs/issues/ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION.md`](../../issues/ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION.md)

**Summary:** A PERF-006 optimization replaced the canonical `useGamingDay()` → RPC path with a pure-JS `getCurrentGamingDay()` that used `new Date().toISOString().slice(0, 10)` (UTC). After UTC midnight (4 PM Pacific), JS returned tomorrow's date while the DB still considered today the current gaming day. Every Player 360 financial panel showed $0.

**Classification:** Governance failure — TEMP-001 §4 Rule 3 ("No Overrides") and TEMP-002 §4 ("Consumer Responsibilities") were violated by a performance optimization that created a second temporal authority in JavaScript.

---

## 2. Prime Directive (non-negotiable)

### TEMP-003.A — Canonical Authority

**The database is the single source of truth** for casino time and gaming day. This restates TEMP-001 §2 Rule 2 and is the root invariant for all enforcement below.

### TEMP-003.B — No JS Business-Date Math

Application code **must not** derive:
- `gaming_day`
- Gaming-day start/end boundaries
- Weekly/monthly range boundaries

Any derivation must happen in **DB functions** that read `casino_settings`.

> **Rationale:** See TEMP-001 §3 (Canonical Function Layering). The `compute_gaming_day()` two-layer contract — Layer 1 (pure math, IMMUTABLE) and Layer 2 (casino-scoped, STABLE) — accounts for timezone, DST, and configurable start time. No JS reimplementation can maintain parity across all edge cases.

---

## 3. Banned Patterns (CI + Code Review Gate)

### 3.1 Hard-Banned in Query Paths

These patterns are **never acceptable** in code that constructs a `gaming_day` value for database queries:

| Pattern | Why Banned | Ref |
|---------|-----------|-----|
| `new Date().toISOString().slice(0, 10)` | UTC calendar date ≠ gaming day | TEMP-001 §3 |
| `toISOString().slice(0, 10)` (any variant) | Same UTC slicing foot-gun | TEMP-001 §3 |
| `getUTCFullYear()` / `getUTCMonth()` / `getUTCDate()` for business dates | UTC math ignores casino timezone + start time | TEMP-001 §5 |
| `new Date()` arithmetic to compute `gaming_day` | Mints a second temporal authority | TEMP-002 §2 |
| Accepting `gaming_day` as RPC/service input | Bypasses trigger-based derivation | TEMP-001 §4 Rule 3 |

### 3.2 Allowed Only in Presentation

| Pattern | Allowed When |
|---------|-------------|
| `Intl.DateTimeFormat` with casino timezone | Formatting timestamps for display only |
| `date-fns` / `dayjs` formatting | Display labels, never query construction |
| Casino-local time labels in UI | Display context only |

### 3.3 Lint Gate (Target)

```
# ESLint rule (future): ban-temporal-bypass
# Flags: toISOString().slice(0, 10) in files matching **/services/**/*.ts, **/app/**/*.tsx
# Severity: error
# Exceptions: files in **/components/ui/** (display-only)
```

---

## 4. Performance Without Temporal Drift

### 4.1 The Problem

Performance optimizations bypass shared hooks/utilities and accidentally create a second temporal authority. This is exactly what happened in the Player 360 incident (see §1 Antipattern Case Study).

The optimization intent was correct: eliminate the client-side waterfall:

```
useAuth → useGamingDay() → usePlayerSummary(gamingDay) → useGamingDaySummary
```

The implementation was wrong: it replaced the RPC with a JS function.

### 4.2 The Only Allowed RSC Path

Every React Server Component that needs `gaming_day` **must** follow this sequence:

```
1. Create server Supabase client
2. Set RLS context (set_rls_context_from_staff() or equivalent)
3. Call rpc_current_gaming_day()
4. Fetch dashboard data using gaming_day returned by DB
5. Pass gaming_day down as props
```

This removes the waterfall **without** inventing JS time logic.

**Key distinction (three-layer contract, see TEMP-001 §3):**
- **Layer 1:** `compute_gaming_day(ts, gstart time)` — IMMUTABLE pure math. Called by triggers.
- **Layer 2:** `compute_gaming_day(casino_id, timestamp)` — STABLE, SECURITY DEFINER. Called by route handlers and service layer. Reads `casino_settings` internally.
- **Layer 3:** `rpc_current_gaming_day(timestamp)` — STABLE, SECURITY DEFINER. Derives `casino_id` from RLS context (`current_setting('app.casino_id', true)`). Called by RSC server helpers. **No spoofable parameters.**
- Client-callable RPCs must **not** accept `casino_id` — scope comes from session context (per ADR-024)

### 4.3 Server Helper Pattern

A single server helper (one import path) should be shared by every RSC surface:

```typescript
// lib/gaming-day/server.ts (canonical import for all RSC pages)
export async function getServerGamingDay(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_current_gaming_day');
  if (error) throw new TemporalAuthorityError(error);
  return data; // date string, e.g. '2026-02-02'
}
```

No RSC page should compute gaming day any other way.

---

## 5. Required RPCs (Canonical API)

> **Important:** Client-callable RPCs must **not** accept `casino_id` or `actor_id`. They must derive scope from **RLS context** (session vars) and/or JWT claims.

### `rpc_current_gaming_day(p_timestamp timestamptz default now()) → date` (Layer 3)

- Derives casino scope from `current_setting('app.casino_id', true)` or JWT fallback
- Internally calls Layer 2 `compute_gaming_day(casino_id, timestamp)` which reads `casino_settings`
- **Purpose:** Resolve the business date for "right now" (or a supplied timestamp) using canonical rules
- **Status:** Specified, not yet migrated (see TEMP-001 §3.3, PRD-027 WS1)

### `rpc_gaming_day_range(p_weeks int, p_end_timestamp timestamptz default now()) → {start_gd date, end_gd date}`

- Computes `end_gd = rpc_current_gaming_day(p_end_timestamp)`
- Computes `start_gd = end_gd - (p_weeks * 7)`
- **Purpose:** Replace all JS "weeks ago" date math for analytics queries

### Optional: `rpc_casino_now() → {utc_now timestamptz, casino_timezone text, casino_local_now timestamptz}`

- Returns DB `now()` plus timezone metadata
- Useful for debugging and observability

---

## 6. Trigger & Function Standardization

### 6.1 No Inline Reimplementation

Triggers and stored procedures **must not** re-implement gaming day boundary logic inline. They must call Layer 1 `compute_gaming_day(ts, gstart)` (after fetching `gstart` from `casino_settings`) or Layer 2 `compute_gaming_day(casino_id, timestamp)`. See TEMP-001 §3.4 Caller Matrix for which layer to use.

**Known violation:** `trg_mtl_entry_set_gaming_day()` reimplements boundary logic inline instead of calling `compute_gaming_day()`. See remediation checklist §8.

**Rationale:** Inline logic drifts. One definition only. (Ref: TEMP-001 §4, Trigger Design Principle #5)

---

## 7. Testing Requirements

### 7.1 Boundary Tests

Automated tests for casino timezone `America/Los_Angeles` (and any supported TZ):

- **05:50 local** — 10 minutes before gaming day boundary
- **06:10 local** — 10 minutes after boundary
- **00:10 UTC** while still the same casino-local gaming day (**the failure mode**)
- DST transition dates: spring forward + fall back

### 7.2 Settings Mutation Tests

If `casino_settings.timezone` or `gaming_day_start_time` changes:
- `rpc_current_gaming_day()` must reflect it immediately
- Cached queries must be invalidated

---

## 8. Remediation Checklist (Current Codebase)

- [ ] Replace all UI surfaces deriving gaming day in JS with `rpc_current_gaming_day()` (P1)
- [ ] Replace all "weeks ago" computations with `rpc_gaming_day_range()` (P2)
- [ ] Refactor `trg_mtl_entry_set_gaming_day()` to call `compute_gaming_day()` (P2, DB migration)
- [ ] Create `lib/gaming-day/server.ts` canonical helper for RSC surfaces (P1)
- [ ] Add ESLint rule to ban `toISOString().slice(0,10)` in query paths (P2)
- [ ] Add boundary + DST tests (P2)
- [ ] Add observability mismatch tripwire in dev/staging (P3)
- [ ] Migrate PitDashboard/PitPanels from deprecated `hooks/use-casino.ts` to `hooks/casino/use-gaming-day.ts` (P2)

---

## 9. Observability Tripwires

Add a dev/staging invariant:

1. Resolve `gaming_day` via the canonical server helper
2. Resolve again via `rpc_current_gaming_day()` directly
3. If mismatch: log error including `casino_settings` snapshot

This catches "rogue bypass" within one deploy cycle.

---

## 10. Definition of Done

TEMP-003 enforcement is "done" when:

1. **No app code** computes gaming day using JS date math
2. **All dashboard queries** use `gaming_day` returned by DB canonical functions
3. **All triggers** reference `compute_gaming_day()` (no inline reimplementations)
4. **Boundary + DST tests** pass
5. **Lint gate** prevents reintroducing banned patterns
6. **RSC surfaces** use the canonical server helper (§4.3)

---

## 11. Consumer Surface Compliance Map

| Surface | Gaming Day Source | Canonical? | Enforcement Status |
|---------|-------------------|------------|-------------------|
| Player 360 summary | `getCurrentGamingDay()` | **No** — P0 hotfixed (hardcoded) | Needs P1 RPC migration |
| Player 360 weekly series | `getWeeksAgoDate()` (UTC) | **No** | Needs P2 range RPC |
| Pit Dashboard | `useGamingDay()` → API → RPC | Yes | Compliant |
| Pit Panels | `useGamingDay()` → API → RPC | Yes | Compliant |
| Gaming Day Indicator | `useGamingDay()` → API → RPC | Yes | Compliant |
| Rating Slip Modal | `useGamingDay()` → API → RPC | Yes | Compliant |
| MTL Compliance | `useGamingDaySummary` | Yes | Compliant |
| Finance write path | DB triggers | Yes | Compliant |
| Visit write path | DB triggers | Yes | Compliant |

---

## Appendix: Why This Matters

Gaming day is a **business concept**, not a timestamp.
UTC calendar dates are a **transport detail**.
When a product mixes those two, the UI intermittently shows "nothing happened" while the casino floor is actively burning money.

**Don't let JavaScript define casino reality.**

---

## References

| Document | Role |
|----------|------|
| [TEMP-001: Gaming Day Specification](./TEMP-001-gaming-day-specification.md) | Canonical computation spec |
| [TEMP-002: Temporal Authority Pattern](./TEMP-002-temporal-authority-pattern.md) | Propagation & ownership model |
| [INDEX.md](./INDEX.md) | Temporal pattern registry |
| [ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION](../../issues/ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION.md) | Antipattern case study (P0 incident) |
| ADR-024 | Authoritative context derivation |

---

## Changelog

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.1 | 2026-02-02 | Formalized three-layer function contract references (§4.2, §5, §6) per TEMP-001 §3 | Lead Architect |
| 1.0 | 2026-02-02 | Governance enforcement standard extracted from incident analysis | Lead Architect |

---

**End of Document**
