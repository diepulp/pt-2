# SRM Addendum — TableContext (Post‑MVP Enhancements)

**Purpose.** Extend TableContext beyond MVP custody/events to cover additional operational controls auditors and regulators expect (sign‑offs, emergency boxes, equipment custody, min‑bet/limit logs, inter‑table chip transfers, incident logging). Monetary ledgers remain in **Finance**; this addendum adds operational logs, approvals, and reconciliation keys.

---

## A) New Operational Objects (TableContext)

1) ### `table_limit_change`
Tracks min/max changes and side‑bet enablement per table (approvals + effective times).  
**Why:** documented control of table limits/signage is a common MICS/IC expectation and affects revenue (mins ↔ decisions/hour). See PA internal controls and NGCB materials ([PGCB temporary regs](https://www.pacodeandbulletin.gov/Display/pabull?file=%2Fsecure%2Fpabulletin%2Fdata%2Fvol40%2F40-23%2F1038.html), [NV MICS overview](https://www.gaming.nv.gov/divisions/audit-division/minimum-internal-control-standards/)).

```sql
create table table_limit_change (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id),
  table_id uuid not null references gaming_table(id),
  min_bet_cents int not null,
  max_bet_cents int,
  side_bets jsonb,                           -- enabled side bets/options
  approved_by uuid references staff(id),
  effective_at timestamptz not null default now(),
  reason text,
  created_at timestamptz not null default now()
);
```

2) ### `table_equipment_event`
Unified log for cards/dice/shufflers (in/out, seal/batch ids, faults, resets).  
**Why:** playing cards/dice control and shuffler custody/faults are core IC topics; custody and reconciliation are highlighted in federal and state standards ([25 CFR 542](https://www.ecfr.gov/current/title-25/chapter-III/subchapter-D/part-542), [NGCB CPA checklist](https://www.gaming.nv.gov/siteassets/content/divisions/audit/cpa-mics-checklist/cpa-mics-table-games-all.pdf)).

```sql
create table table_equipment_event (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id),
  table_id uuid not null references gaming_table(id),
  kind text not null check (kind in ('cards_in','cards_out','dice_in','dice_out','shuffler_fault','shuffler_reset')),
  batch_or_seal_id text,                     -- deck batch, dice seal, etc.
  note text,
  created_at timestamptz not null default now()
);
```

3) ### `table_incident_event`
Operational incidents (AP suspicion, mispay dispute, equipment anomaly) with surveillance linkage.  
**Why:** regulators emphasize traceable incident records and surveillance linkage during drops/count and table operations ([NJ DGE Ch. 69D](https://www.nj.gov/lps/ge/docs/Regulations/CHAPTER69D.pdf), [25 CFR 542.21](https://www.law.cornell.edu/cfr/text/25/542.21)).

```sql
create table table_incident_event (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id),
  table_id uuid not null references gaming_table(id),
  kind text not null,
  severity text check (severity in ('low','medium','high','critical')),
  surveillance_ticket_id text,
  note text,
  created_at timestamptz not null default now()
);
```

4) ### `table_chip_transfer` (inter‑table)
Pit‑approved chip rebalancing between tables (non‑cage).  
**Why:** documented transfers reduce custody gaps and smooth operations during spikes; ICs require evidence trails (see NGCB CPA checklist above).

```sql
create table table_chip_transfer (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references casino(id),
  from_table_id uuid not null references gaming_table(id),
  to_table_id uuid not null references gaming_table(id),
  chipset jsonb not null,                    -- denom → qty
  authorized_by uuid references staff(id),
  created_at timestamptz not null default now()
);
```

---

## B) Extensions to Existing Tables

- **`table_drop_event`** — add `emergency boolean default false`, `notification_ref text`.  
  **Why:** emergency drop boxes must be marked, table‑numbered, and reported contemporaneously to Division & surveillance ([NJAC 13:69D‑1.16](https://www.law.cornell.edu/regulations/new-jersey/N-J-A-C-13-69D-1-16)).

- **`table_inventory_snapshot`** — keep `snapshot_type in ('open','close','rundown')`; add a scheduled compliance job to ensure a daily **closed‑table** inventory record exists even when a table never opened that day ([PGCB 465b](https://gamingcontrolboard.pa.gov/sites/default/files/Gaming%20Law%20%26%20Regulations/Statements-of-Policy-Tech-Standards/Technical_Standards_Section_465b3.pdf)).

---

## C) Drop/Count Schedule & Reconciliation Policies

- **Schedule conformance.** Persist a configurable `scheduled_drop_window` and validate `table_drop_event.removed_at` against schedule; deviations require `table_incident_event` with supervisor ack ([NJ DGE scheduling rule](https://www.nj.gov/lps/ge/docs/EmergencyRegs/031011/1369D117.pdf)).

- **Master game summary trace.** Ensure fill/credit slip references reconcile to the master game summary in accounting ([NV ICP Table Games](https://www.gaming.nv.gov/siteassets/content/divisions/tax-license/icp/icp-TableGames-V4-final.pdf), [NV MICS Table Games v9](https://www.gaming.nv.gov/siteassets/content/divisions/audit/mics/v9-table-games.pdf)).

---

## D) Role & RLS Posture (extends MVP)

- **Write:** `pit_boss` for limit/equipment/incident/transfer; `count_team` limited to custody notes; all scope‑checked by `casino_id`.  
- **Read:** same‑casino for pit, accounting, compliance; surveillance via read‑only role.  
- **Events:** emit `table.limit_changed`, `table.equipment_fault|reset`, `table.incident_logged`, `table.chip_transfer` with correlation keys `{casino_id, table_id, staff_id, ts}`.  
- **Idempotency:** equipment/incident/transfer RPCs accept `request_id` to prevent duplicates from handheld retries.

---

## E) KPIs & Alerts

- **Limit adherence:** min‑bet changes vs. daypart; % out‑of‑policy mins (see MICS/IC references above).  
- **Equipment integrity:** shuffler fault rate & MTTR; card/dice change cadence (NGCB checklist).  
- **Drop schedule:** median removed→counted, % on‑time; emergency box usage rate (NJ DGE).  
- **Custody integrity:** % chip transfers with dual authorization; incident close‑rate under SLA.

---

## F) Boundaries & Ownership

- **TableContext:** operational records (no monetary values).  
- **Finance:** monetary counts (`count_room_drop_count`), markers, ledgers, variance ([25 CFR 542](https://www.ecfr.gov/current/title-25/chapter-III/subchapter-D/part-542), [25 CFR 542.12](https://www.law.cornell.edu/cfr/text/25/542.12)).  
- **Reporting (projection):** join custody + counts for “drop amount per table/day” and master‑summary reconciliation (NV ICP & MICS references above).

---

### Reference Index
- Nevada MICS Table Games v9 (fills/credits reconciliation) — https://www.gaming.nv.gov/siteassets/content/divisions/audit/mics/v9-table-games.pdf  
- NGCB MICS overview page — https://www.gaming.nv.gov/divisions/audit-division/minimum-internal-control-standards/  
- NGCB CPA MICS Table Games checklist — https://www.gaming.nv.gov/siteassets/content/divisions/audit/cpa-mics-checklist/cpa-mics-table-games-all.pdf  
- Nevada ICP Table Games (trace to master game summary) — https://www.gaming.nv.gov/siteassets/content/divisions/tax-license/icp/icp-TableGames-V4-final.pdf  
- NJ DGE 13:69D‑1.16 Emergency drop boxes — https://www.law.cornell.edu/regulations/new-jersey/N-J-A-C-13-69D-1-16  
- NJ DGE scheduling and transport — https://www.nj.gov/lps/ge/docs/EmergencyRegs/031011/1369D117.pdf  
- 25 CFR Part 542 (Federal tribal MICS) — https://www.ecfr.gov/current/title-25/chapter-III/subchapter-D/part-542  
- 25 CFR 542.12 & 542.21 (drop/count standards) — https://www.law.cornell.edu/cfr/text/25/542.12 , https://www.law.cornell.edu/cfr/text/25/542.21  
- PGCB 465b (Table Inventory, opening/closing procedures) — https://gamingcontrolboard.pa.gov/sites/default/files/Gaming%20Law%20%26%20Regulations/Statements-of-Policy-Tech-Standards/Technical_Standards_Section_465b3.pdf  
- PGCB temporary regs (credit/fill signatures & distribution) — https://www.pacodeandbulletin.gov/Display/pabull?file=%2Fsecure%2Fpabulletin%2Fdata%2Fvol40%2F40-23%2F1038.html
