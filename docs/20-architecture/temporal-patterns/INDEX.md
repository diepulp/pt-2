# Temporal Patterns Registry

**Single source of truth** for all temporal architecture, governance, and enforcement in PT-2.

> If you are modifying code that touches `gaming_day`, date ranges, casino time, or timezone-aware queries — **start here**.

---

## Document Registry

| ID | Document | Role | Status |
|----|----------|------|--------|
| TEMP-001 | [Gaming Day Specification](./TEMP-001-gaming-day-specification.md) | Canonical computation spec: defines three-layer `compute_gaming_day()` contract, triggers, schema, DST handling | Active (v1.2) |
| TEMP-002 | [Temporal Authority Pattern](./TEMP-002-temporal-authority-pattern.md) | Ownership & propagation model: CasinoService authority, trigger/RPC/DTO propagation, cache policy | Active (v1.2) |
| TEMP-003 | [Temporal Governance Enforcement](./TEMP-003-temporal-governance-enforcement.md) | Enforcement layer: banned patterns, RSC safe path, CI gates, remediation checklist, compliance map | Active (v1.1) |

### Antipattern Reference

| Document | Purpose |
|----------|---------|
| [ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION](../../issues/ISSUE-GAMING-DAY-TIMEZONE-STANDARDIZATION.md) | P0 incident case study — JS temporal bypass caused $0 dashboard regression. Root cause analysis, affected code map, and remediation tiers. |

---

## Function Layering (canonical contract)

The gaming day computation is a three-layer contract. Each layer has specific callers. Mixing layers causes the kind of spec rot that leads to incidents.

| Layer | Function | Volatility | Callers | Reference |
|-------|----------|-----------|---------|-----------|
| **Layer 1** | `compute_gaming_day(ts timestamptz, gstart time)` | `IMMUTABLE` — pure math, no table reads | DB triggers (fetch `gstart` from `casino_settings` first) | TEMP-001 §3.1 |
| **Layer 2** | `compute_gaming_day(p_casino_id uuid, p_timestamp timestamptz)` | `STABLE, SECURITY DEFINER` — reads `casino_settings` | Route handlers, service layer, RPCs with `casino_id` | TEMP-001 §3.2 |
| **Layer 3** | `rpc_current_gaming_day(p_timestamp timestamptz)` | `STABLE, SECURITY DEFINER` — derives casino from RLS context | RSC server helpers, server actions | TEMP-001 §3.3 |

**Layer 3 status:** Specified, not yet migrated. See PRD-027 WS1.

---

## Decision Matrix: "How do I get gaming day?"

| Context | Method | Layer | Reference |
|---------|--------|-------|-----------|
| **DB trigger** (row insert/update) | Fetch `gstart` from `casino_settings`, call `compute_gaming_day(ts, gstart)` | Layer 1 | TEMP-001 §3.1, §4 |
| **DB RPC** (server function with `casino_id`) | Call `compute_gaming_day(casino_id, timestamp)` | Layer 2 | TEMP-001 §3.2 |
| **Route handler** (`GET /api/v1/casino/gaming-day`) | Call `compute_gaming_day(casino_id, timestamp)` with `casino_id` from RLS middleware | Layer 2 | TEMP-002 §3B |
| **React Server Component** (RSC) | `rpc_current_gaming_day()` via server Supabase client after `set_rls_context_from_staff()` | Layer 3 | TEMP-003 §4.2 |
| **Client component** | `useGamingDay()` hook → `GET /api/v1/casino/gaming-day` → Layer 2 | Via API | TEMP-002 §3B |
| **Server action** | `rpc_current_gaming_day()` via server client | Layer 3 | TEMP-003 §4.3 |
| **JS date math** (`new Date()`, `toISOString().slice()`) | **BANNED** | N/A | TEMP-003 §3 |

---

## Invariants (non-negotiable)

1. **Single temporal authority.** The database owns `gaming_day` via `casino_settings` + `compute_gaming_day()`. No other system may define business dates.

2. **No JS business-date math.** Application code must not derive `gaming_day`, gaming-day boundaries, or weekly/monthly ranges. Formatting for display is allowed.

3. **No inline reimplementation.** Triggers and stored procedures must call `compute_gaming_day()` — never re-implement boundary logic inline.

4. **No parameter bypass.** Client-callable RPCs must not accept `casino_id` or `gaming_day`. Scope derives from RLS context (ADR-024).

5. **Performance is not an excuse.** RSC surfaces that need gaming day without client waterfalls must use the server RPC path (TEMP-003 §4.2), not JS date functions.

---

## Quick Compliance Check

Before merging code that touches gaming day or date ranges, verify:

- [ ] `gaming_day` values come from DB (`compute_gaming_day`, `rpc_current_gaming_day`, or trigger-populated column)
- [ ] No `toISOString().slice(0, 10)` or `new Date()` arithmetic in query paths
- [ ] RSC pages use the canonical server helper pattern (TEMP-003 §4.3)
- [ ] Client components use `useGamingDay()` hook (not custom date math)
- [ ] Triggers call `compute_gaming_day()` (not inline boundary logic)
- [ ] Date range queries use `rpc_gaming_day_range()` or DB-computed boundaries

---

## Canonical Code Paths

### Write Path (triggers → Layer 1)

```
casino_settings
  ├── gaming_day_start_time: '06:00' (type: time)
  └── timezone: 'America/Los_Angeles'
        ↓ READ by each trigger function
        ↓ then CALLS Layer 1:
compute_gaming_day(ts, gstart time)  [IMMUTABLE, pure math]
        ↓ CALLED by triggers on:
        ├── visit                          (set_visit_gaming_day)
        ├── player_financial_transaction   (set_fin_txn_gaming_day)
        ├── table_session                  (set_table_session_gaming_day)
        ├── pit_cash_observation           (trg_pit_cash_observation_set_gaming_day)
        └── mtl_entry  ⚠️ INLINE — needs migration to call Layer 1
```

### Read Path — Route Handler (Layer 2)

```
GET /api/v1/casino/gaming-day
  → withServerAction middleware (extracts casino_id from RLS context)
  → compute_gaming_day(casino_id, timestamp)  [Layer 2: STABLE, SECURITY DEFINER]
  → GamingDayDTO response
        ↓ CONSUMED by
  useGamingDay() hook → PitDashboard, PitPanels, GamingDayIndicator, RatingSlipModal
```

### Read Path — RSC (Layer 3, planned)

```
RSC page.tsx
  → createClient() + set_rls_context_from_staff()
  → rpc_current_gaming_day(timestamp)  [Layer 3: derives casino from RLS context]
  → gamingDay prop passed to client components
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-02 | Formalized three-layer function contract, updated decision matrix and code paths |
| 2026-02-02 | Initial registry created. TEMP-001 v1.2, TEMP-002 v1.2, TEMP-003 v1.1 published. |
