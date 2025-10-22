# SRM Addendum v3.0.2 — Rating Slip Bounded Context & Mid‑Session Rewards

**Purpose:** Canonicalize the **Rating Slip** service bounded context, define its lifecycle, and introduce a **mid‑session rewards** mechanism that is consistent with the contract‑first SRM. This addendum removes ambiguity about points caching and specifies atomic, idempotent issuance of rewards during live play.

---

## 1) Context & Stance (Canonical)

- **Bounded Context:** **Rating Slip** tracks live table play telemetry for a player during a visit (start/end times, average bet, table/casino links, optional game settings snapshot).  
- **Source of Truth for Points:** **Loyalty is SoT.** Rating Slip **does not cache points.**  
- **Separation of Concerns:** Rating Slip emits **telemetry**; **Loyalty** issues and stores **rewards** (ledger entries + player balance).  
- **Lifecycle Hook:** A session (rating_slip) may prompt **mid‑session** rewards prior to closure, based on telemetry or staff action with policy controls.

> If you later choose to re‑introduce a denormalized cache on rating_slip, you must add it to the SRM with trigger + reconciliation. For now, **no cache** is the contract.

---

## 2) Rating Slip Lifecycle (Canonical States)

```text
created → open → (optional: paused/resumed)* → closed → archived (optional)
```

- **created:** Inserted with `start_time` and references (`player_id`, `casino_id`, optional `visit_id`, `table_id`).  
- **open:** Accepts telemetry updates (e.g., `average_bet`), and is eligible for **mid‑session rewards**.  
- **paused/resumed (optional):** Temporarily halts telemetry accrual; ledger issuance still allowed but subject to policy.  
- **closed:** Finalized with `end_time`; no further rewards unless explicitly permitted by policy (e.g., post‑close corrections by admins).  
- **archived:** (Optional) Logical/physical archive outside day‑to‑day operations.

**Invariants**
- `start_time <= end_time` (when set)  
- `player_id`, `casino_id` immutable after creation  
- Only **open** (or explicitly policy‑allowed) slips may issue mid‑session rewards

---

## 3) Data Model Extensions (SRM‑Aligned, snake_case, uuid)

### 3.1 Enums

```sql
-- Reasons canonicalized for audits and rules
create type loyalty_reason as enum ('mid_session','session_end','manual_adjustment','promotion','correction');
```

### 3.2 Tables & Columns

```sql
-- Rating slip (no points cache; telemetry only)
alter table rating_slip
  add column if not exists status text not null default 'open',  -- 'open'|'closed' (and optional 'paused')
  add column if not exists policy_snapshot jsonb;                -- capture thresholds/caps at issuance time (optional)

-- Loyalty ledger supports mid-session issuance with strong auditability
alter table loyalty_ledger
  add column if not exists staff_id uuid references staff(id) on delete set null,
  add column if not exists rating_slip_id uuid references rating_slip(id) on delete set null,
  add column if not exists reason loyalty_reason not null default 'mid_session',
  add column if not exists idempotency_key text;                 -- to prevent duplicate issuance

-- Partial unique index to enforce idempotency when a key is provided
create unique index if not exists ux_loyalty_ledger_idem
  on loyalty_ledger (idempotency_key)
  where idempotency_key is not null;
```

> **Note:** `player_loyalty` remains SoT for balances; ledger rows append deltas and drives balance updates in your service logic or via triggers if you standardize that pattern.

---

## 4) Mid‑Session Rewards: Contract & Policy

### 4.1 Policy Concepts

- **Eligibility:** Rating slip must be `open` (or `paused` if your policy allows). Player and slip must resolve to the same `casino_id` as the issuing staff.  
- **Caps & Throttles:** Optional policy constraints to prevent abuse:  
  - **Per‑session cap (points):** Sum of mid‑session `points_earned` ≤ `cap_points_per_session`.  
  - **Cooldown:** Minimum interval between mid‑session awards (e.g., 10 minutes).  
  - **Max frequency:** Max N awards per session.  
  - **Role gating:** Only `staff.role in ('admin','pit_boss')` (or configured set) can issue mid‑session rewards.  
- **Auditability:** Every issuance logs `staff_id`, `rating_slip_id`, `reason='mid_session'`, `idempotency_key` (if client supplies), and optional `policy_snapshot` captured from `casino_settings` at issuance time.

### 4.2 Contract Invariants

- A mid‑session reward **MUST** reference `player_id` and `rating_slip_id`.  
- The referenced `rating_slip.status` must be `open` (unless special policy).  
- The issuance **MUST** be atomic and idempotent (using `idempotency_key`).  
- On success, ledger entry is appended and `player_loyalty.balance` reflects the change (synchronously or via a single function that does both).

---

## 5) Atomic Issuance Function (SRM RPC Contract)

> Canonical server function to **atomically** issue mid‑session rewards.

```sql
create or replace function rpc_issue_mid_session_reward(
  p_player_id uuid,
  p_rating_slip_id uuid,
  p_staff_id uuid,
  p_points int,
  p_reason loyalty_reason default 'mid_session',
  p_idempotency_key text default null
) returns table (
  ledger_id uuid,
  new_balance int
) language plpgsql security definer as $$
declare
  v_casino_id uuid;
  v_status text;
  v_balance int;
  v_now timestamptz := now();
begin
  -- Validate rating slip
  select casino_id, status
    into v_casino_id, v_status
  from rating_slip
  where id = p_rating_slip_id and player_id = p_player_id
  for update;  -- lock slip row for duration

  if not found then
    raise exception 'rating_slip not found or mismatched player' using errcode = 'P0002';
  end if;

  if v_status <> 'open' then
    raise exception 'rating_slip not open' using errcode = 'P0001';
  end if;

  -- Optional: role/ownership check via staff table
  perform 1 from staff s
   where s.id = p_staff_id and s.casino_id = v_casino_id and s.status = 'active';
  if not found then
    raise exception 'staff not authorized for this casino' using errcode = '42501';
  end if;

  -- Idempotency: if key provided and exists, return existing outcome
  if p_idempotency_key is not null then
    return query
      select l.id, (select balance from player_loyalty where player_id = p_player_id)
      from loyalty_ledger l
      where l.idempotency_key = p_idempotency_key
      limit 1;
    if found then
      return;
    end if;
  end if;

  -- Insert ledger row
  insert into loyalty_ledger (player_id, points_earned, reason, rating_slip_id, staff_id, created_at, game_type)
  select p_player_id, p_points, coalesce(p_reason,'mid_session'), p_rating_slip_id, p_staff_id, v_now,
         (select type from gaming_table gt join rating_slip rs on rs.table_id = gt.id where rs.id = p_rating_slip_id)
  returning id into ledger_id;

  -- Optional: stamp idempotency after insert (if key provided)
  if p_idempotency_key is not null then
    update loyalty_ledger set idempotency_key = p_idempotency_key where id = ledger_id;
  end if;

  -- Update player balance (SoT)
  update player_loyalty
     set balance = balance + p_points,
         updated_at = v_now
   where player_id = p_player_id
   returning balance into v_balance;

  return query select ledger_id, v_balance;
end $$;
```

**Notes**
- Keep business caps/cooldowns either enforced in this function (with a small config table) or via a policy layer. If enforced here, define a `loyalty_policy` table keyed by `casino_id` and snapshot it into `rating_slip.policy_snapshot` on issuance for audit.

---

## 6) RLS Excerpts (Minimal Contract)

```sql
-- rating_slip: read/write within same casino; write only when role allows
alter table rating_slip enable row level security;

-- Example: widen reads, tighten writes via staff + casino ownership
-- (Exact policy text depends on your auth model; shown conceptually)
-- create policy rating_slip_read on rating_slip for select using (
--   exists (select 1 from staff s where s.id = auth.uid() and s.casino_id = rating_slip.casino_id)
-- );
-- create policy rating_slip_write on rating_slip for update using (
--   exists (select 1 from staff s where s.id = auth.uid() and s.casino_id = rating_slip.casino_id and s.role in ('admin','pit_boss'))
-- );

-- loyalty_ledger: append-only for authorized actors; reads scoped by casino via joins (or materialized view)
alter table loyalty_ledger enable row level security;
-- create policy ledger_insert on loyalty_ledger for insert with check (
--   exists (select 1 from staff s
--             join rating_slip rs on rs.id = rating_slip_id
--           where s.id = auth.uid()
--             and s.casino_id = rs.casino_id
--             and s.role in ('admin','pit_boss'))
-- );
```

> Recommended: Client calls **`rpc_issue_mid_session_reward`**; do **not** allow direct inserts from untrusted clients.

---

## 7) Contract Tests (Examples)

- **Happy path:** open slip → call `rpc_issue_mid_session_reward` → returns `(ledger_id, new_balance)`; ledger row present; balance increased.  
- **Idempotency:** same `idempotency_key` twice → second call returns first result; no duplicate ledger.  
- **Authorization:** staff from another casino → `42501` (policy denied).  
- **State guard:** closed slip → `P0001` error.  
- **Caps (if configured):** exceeding per‑session cap → error with code `check_violation`/custom.

---

## 8) SRM Checklists (Rating Slip & Loyalty)

### Rating Slip
- [ ] Table `rating_slip` has **no points cache**.  
- [ ] States supported: `open` (required), `closed` (required), optional `paused`.  
- [ ] Columns: `player_id`, `casino_id`, `visit_id?`, `table_id?`, `average_bet?`, `start_time`, `end_time?`, `status`, `policy_snapshot?`.  
- [ ] RLS: same‑casino read; write restricted to authorized roles.  
- [ ] Mid‑session eligibility defined (open or policy exception).

### Loyalty
- [ ] `loyalty_ledger` includes `staff_id`, `rating_slip_id`, `reason loyalty_reason`, `idempotency_key?` (unique when present).  
- [ ] `player_loyalty` remains SoT; balance updated by the issuance function.  
- [ ] `rpc_issue_mid_session_reward` exists and enforces atomicity + idempotency + ownership.  
- [ ] Indexes:
  - `(player_id, created_at desc)` on `loyalty_ledger`  
  - Consider `(rating_slip_id, created_at desc)` for audits

---

## 9) Deprecations

```md
**DEPRECATIONS**
- `rating_slip.points` — deprecated in v3.0.0, EOL v3.2.0. (This addendum confirms **no cache** stance.)
```

---

## 10) Integration Guidance (Service/API)

- **Client flow:** UI calls a server action → server calls `rpc_issue_mid_session_reward` with `idempotency_key` (GUID) to shield against double‑clicks/retries.  
- **Observability:** Log issuance attempts with request ID; surface denial reasons in admin UI.  
- **Reconciliation:** End‑of‑session process may compute a recommended award; if mid‑session awards already occurred, it issues the **delta** only.

---

## 11) Acceptance Criteria for This Addendum

- [ ] SRM merged with: lifecycle, no‑cache stance, function contract, and RLS excerpts.  
- [ ] Schema updated: enum `loyalty_reason`, ledger columns (staff_id, rating_slip_id, idempotency_key), partial unique index, rating_slip status/policy_snapshot.  
- [ ] Contract tests implemented (happy path, idempotency, auth, state guard).  
- [ ] Service wired to call `rpc_issue_mid_session_reward` (no direct ledger writes from client).

---

**Result:** Mid‑session rewards are now first‑class, auditable, and safe. The SRM unambiguously asserts **Loyalty as SoT**, keeps Rating Slip telemetry‑only, and provides a single atomic entry point for issuing rewards during live play.
