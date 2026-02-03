# TIMEZONE & GAMING DAY STANDARDIZATION (TEMP-001)

**Status:** Proposed standard (MVP + multi-casino safe)  
**Scope:** All services, RPCs, triggers, and UI surfaces that read/write by gaming day, casino time, or date ranges.  
**Problem class:** Dual sources of truth for time (UTC calendar vs casino-local business day) causing “zero rows / $0 everywhere” regressions.

---

## 1) Executive summary

The system must have **exactly one authority** for:

- **Casino timezone**
- **Casino “now”**
- **Gaming day** (business date partition key)
- **Gaming day range boundaries** (weeks/months)

That authority is **Postgres**, parameterized by `casino_settings` and scoped by RLS context.

**App code may format timestamps for display. App code must not define business dates.**

---

## 2) Root cause (what failed)

A UI surface computed `gaming_day` as a **UTC calendar date** (e.g., `toISOString().slice(0,10)`), while the database canonical logic defines gaming day using:

- `casino_settings.timezone` (e.g., `America/Los_Angeles`)
- `casino_settings.gaming_day_start_time` (e.g., `06:00`)

After **UTC midnight** (4pm PT), the UI began querying “tomorrow” and returned **zero rows**, making dashboards appear empty.

This is a governance failure: **TEMP-001 was bypassed** by a performance optimization that minted a second temporal authority in JavaScript.

---

## 3) Prime directive (non-negotiable)

### TEMP-001.A — Canonical authority
**The database is the single source of truth** for casino time and gaming day.

### TEMP-001.B — No JS business-date math
Application code **must not** derive:
- `gaming_day`
- gaming-day start/end boundaries
- weekly/monthly range boundaries

Any derivation must happen in **DB functions** that read `casino_settings`.

---

## 4) Standard architecture

### 4.1 Required RPCs (canonical API)

> **Important:** Client-callable RPCs must **not** accept `casino_id` or `actor_id`.  
> They must derive scope from **RLS context** (session vars) and/or JWT claims.

#### RPC: `rpc_current_gaming_day(p_timestamp timestamptz default now()) returns date`
- Derives casino scope from RLS context:
  - `current_setting('app.casino_id', true)` (preferred)
  - or JWT claim fallback (if used)
- Internally calls `compute_gaming_day(...)`

**Purpose:** Resolve the business date for “right now” (or for a supplied timestamp) using canonical rules.

#### RPC: `rpc_gaming_day_range(p_weeks int, p_end_timestamp timestamptz default now()) returns {start_gd date, end_gd date}`
- Computes `end_gd = rpc_current_gaming_day(p_end_timestamp)`
- Computes `start_gd = end_gd - (p_weeks * 7 days)` (or equivalent)
- Optionally returns inclusive/exclusive semantics explicitly.

**Purpose:** Replace all JS “weeks ago” date math used for analytics queries.

#### Optional RPC: `rpc_casino_now() returns {utc_now timestamptz, casino_timezone text, casino_local_now timestamptz}`
- Returns DB `now()` plus timezone metadata.
- Useful for debugging and observability.

---

## 5) Data model conventions

### 5.1 Store physical time as `timestamptz` (UTC)
All events store `created_at`, `occurred_at`, etc. as `timestamptz`.

### 5.2 Store business partition key as `gaming_day date`
`gaming_day` is a **derived** business key used for:
- filtering
- rollups
- caching
- indexing

It is not computed in the UI.

### 5.3 Indexing
Any high-read tables used by dashboards should have composite indexes that include:
- `(casino_id, gaming_day, …)` or
- `(casino_id, gaming_day)` at minimum

---

## 6) Trigger & function standardization

### 6.1 No inline reimplementation of gaming day logic
Triggers and stored procedures **must not** re-implement “06:00 boundary” logic inline.

Instead:
- call `compute_gaming_day(casino_id, timestamptz)` (or wrapper)
- or call `rpc_current_gaming_day(p_timestamp)` where appropriate

**Rationale:** Inline logic drifts. One definition only.

---

## 7) UI / API usage rules

### 7.1 The only allowed way to obtain gaming day
- Server (RSC/server actions): call `rpc_current_gaming_day()`
- Client: call server endpoint/helper that returns the resolved gaming day (or call RPC only if the client is already correctly scoped via RLS context)

### 7.2 Allowed: display formatting
UI may:
- format timestamps into casino timezone for display
- show “casino local time” labels

UI may not:
- define the date used to query business partitions

---

## 8) Banned patterns (lint + code review gate)

### 8.1 Hard-banned in query paths
- `new Date()` business logic for gaming day
- `toISOString().slice(0, 10)` (or any UTC-date slicing) used to define `gaming_day`
- `getUTC*()` math to define business dates

### 8.2 Allowed only in presentation
- using `Intl.DateTimeFormat` to format timestamps into the casino timezone
- purely UI display helpers

---

## 9) Performance without temporal drift

### Problem
Perf optimizations often bypass shared hooks/utilities and accidentally create a second temporal authority.

### Solution
Create a **server helper** (single import path) used by every RSC surface:

1. create server Supabase client  
2. set RLS context once (`set_rls_context_from_staff()` or equivalent)  
3. call `rpc_current_gaming_day()`  
4. fetch dashboard data using `gaming_day` returned by DB  
5. pass `gaming_day` down as props  

This removes waterfalls **without** inventing JS time logic.

---

## 10) Testing requirements (must-have)

### 10.1 Boundary tests
Add automated tests for casino timezone `America/Los_Angeles` (and any supported TZ):

- **05:50 local** (10 minutes before gaming day boundary)
- **06:10 local** (10 minutes after boundary)
- **00:10 UTC** while still the same casino-local gaming day (the failure mode)
- DST transition dates:
  - spring forward
  - fall back

### 10.2 Settings mutation tests
If `casino_settings.timezone` or `gaming_day_start_time` changes:
- `rpc_current_gaming_day()` must reflect it immediately
- any cached queries must be invalidated

---

## 11) Observability tripwires (recommended)

Add a dev/staging invariant:
- Resolve `gaming_day` via canonical helper
- Resolve again via `rpc_current_gaming_day()` directly
- If mismatch: log an error including `casino_settings` snapshot

This catches “rogue bypass” quickly.

---

## 12) Remediation checklist (apply to current codebase)

- [ ] Replace all UI surfaces deriving gaming day in JS with `rpc_current_gaming_day()`
- [ ] Replace all “weeks ago” computations with `rpc_gaming_day_range()`
- [ ] Refactor any triggers reimplementing boundary logic to call `compute_gaming_day()`
- [ ] Add lint rule to ban `toISOString().slice(0,10)` in query paths
- [ ] Add boundary + DST tests
- [ ] Add observability mismatch tripwire in dev/staging

---

## 13) Definition of Done (DoD)

TEMP-001 is “done” when:

1. No app code computes gaming day using JS date math.
2. All dashboard queries use `gaming_day` returned by DB canonical functions.
3. Triggers and rollups reference a single canonical gaming day function.
4. Boundary + DST tests pass.
5. Lint gate prevents reintroducing the banned patterns.

---

## Appendix: Short rationale

Gaming day is a **business concept**, not a timestamp.
UTC calendar dates are a **transport detail**.
When a product mixes those two, the UI will intermittently show “nothing happened” while the casino floor is actively burning money.

Don’t let JavaScript define casino reality.
