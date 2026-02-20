---
title: Shift Win/Loss Opening Baseline Policy (Dual-Mode: Inventory Count default)
doc_type: policy
status: draft
version: 0.1
date: 2026-02-19
owner_context: TableContext
audience: pit_ops, engineering, compliance
related:
  - Need/Par Dual Policy for Table Inventory (Inventory Count vs Imprest-to-Par)
  - ISSUE-B8B516AF (Shift Dashboard Win/Loss Shows $0 After Inventory Count)
---

# 1) Purpose

Define **how PT establishes the opening bankroll baseline** used for **shift win/loss** when the system supports:

- **INVENTORY_COUNT (default)** — counts are the truth; par is a target.
- **IMPREST_TO_PAR** — par is enforced at boundaries; par may stand in as a baseline.

This policy specifically covers the **bootstrapping period** (new casino / new table / first shift after onboarding) where an explicit opening snapshot may not yet exist.

# 2) Definitions (plain language)

- **Par target**: the intended tray bankroll target (set during onboarding).
- **Need**: amount to request (fill/credit) to reach par given the current bankroll.
- **Snapshot**: a recorded bankroll state (opening/closing count, or a synthetic baseline).
- **Opening baseline**: the bankroll number the system uses as “opening bankroll” for win/loss math for a time window.

# 3) Non-negotiables

1. **Win/loss math requires an opening baseline.** If missing, computed win/loss is *unknown* (not zero).
2. **INVENTORY_COUNT default must not pretend par is a counted bankroll.**  
   Par may be used only as a **bootstrapping estimate** and must be labeled as such (provenance).
3. **All synthetic baselines must be auditable.** A reviewer must be able to see *how* a baseline was chosen.

# 4) Baseline Sources (ranked)

When calculating shift win/loss for `[window_start, window_end]`, determine `opening_bankroll_cents` using the first applicable source below.

## 4.1 Source A — Verified opening snapshot (preferred)
Use the most recent snapshot at or before `window_start` that is **verifiably “opening”** (or a counted snapshot with an “open” semantic).

- Provenance: `opening_source = "snapshot:verified_open"`
- Applies to: **both modes**

## 4.2 Source B — Verified closing snapshot from prior boundary (Inventory Count compatible)
If there is no opening snapshot, use the most recent **counted** snapshot at or before `window_start` (often a prior shift close).

- Provenance: `opening_source = "snapshot:prior_count"`
- Applies to: **INVENTORY_COUNT** (and Imprest-to-par, though Imprest will usually have Source A)

> This preserves the “count is truth” premise: you are still using a real count, not a target.

## 4.3 Source C — Bootstrapped par baseline (allowed, but labeled)
If no prior counted snapshot exists (typical new table / day 1), bootstrap using onboarding par:

- `opening_bankroll_cents := gaming_table.par_total_cents`
- Provenance: `opening_source = "bootstrap:par_target"`
- Applies to:
  - **IMPREST_TO_PAR**: acceptable operational assumption (par is enforced).
  - **INVENTORY_COUNT**: acceptable *only as a bootstrap estimate* (must be called out as synthetic).

**Important:** This source is not a “count.” It is a **baseline estimate** to avoid “win/loss unknown” during first shift.

## 4.4 Source D — In-window fallback (partial-window, last resort)
If none of the above exist, use the earliest snapshot *inside* the window as baseline.

- Provenance: `opening_source = "fallback:earliest_in_window"`
- Applies to: **both modes**
- Caveat: win/loss becomes **partial-window** (from that snapshot forward).

## 4.5 Source E — No baseline (show unknown)
If no baseline can be established, return `NULL` for win/loss and show **N/A** with a CTA.

- Provenance: `opening_source = "none"`
- Applies to: **both modes**

# 5) Decision Table

| Condition | Mode | Baseline chosen | Win/Loss coverage | UI expectation |
|---|---|---|---|---|
| Opening snapshot exists pre-window | either | Source A | full window | normal value |
| No opening, but prior counted snapshot exists | default INVENTORY_COUNT | Source B | full window | normal value |
| No snapshots exist yet, par exists | either | Source C | full window (estimated) | value shown **with “bootstrapped” indicator** |
| Only in-window snapshot exists | either | Source D | partial window | value + “partial window” indicator |
| Nothing exists | either | Source E | unknown | “N/A” + “Opening count required” |

# 6) Required provenance fields (engineering contract)

Wherever shift win/loss is computed (RPC or read model), the output must include:

- `opening_bankroll_cents`
- `opening_source` (enum string above)
- `opening_snapshot_id` (nullable)
- `opening_at` (timestamp of the baseline source, if any)
- `coverage_type` = `full | partial | unknown`

This prevents the UI from silently converting NULL to `$0`.

# 7) How onboarding par becomes a baseline (day-1 mechanics)

Onboarding Step “Par Targets” must do **two things**:

1. Persist `gaming_table.par_total_cents` (already required).
2. Mark the table as **baseline-ready** for bootstrapping, e.g.:
   - `gaming_table.par_set_at`
   - optionally `gaming_table.par_set_by_staff_id`

Then, when the first table session opens:

- If mode = **IMPREST_TO_PAR**: create an actual **opening snapshot** equal to par (operationally consistent).
- If mode = **INVENTORY_COUNT** (default): either
  - **Preferred**: do *not* create a “counted” snapshot; instead create a **synthetic baseline snapshot** with explicit labeling, or
  - **Alternative**: skip snapshot creation and let shift computation use Source C dynamically.

### Recommended implementation stance (minimal + honest)

- Implement **Source C** as a bootstrapped baseline path for *shift computation*.
- If you choose to materialize it, store it as:
  - `snapshot_type = 'open'`
  - `is_synthetic = true`
  - `synthetic_reason = 'bootstrap:par_target'`

# 8) UI rules (stop lying)

- If computed win/loss is `NULL` → show `"N/A"` not `"$0"`.
- If `opening_source` is `bootstrap:par_target` → show a small indicator:
  - “Bootstrapped from par target (first shift)”
- If `coverage_type = partial` → show:
  - “Partial window (baseline mid-shift)”
- Always provide CTA when `opening_source in ('none')`:
  - “Record opening count” (or “Start session / record snapshot”, depending on workflow)

# 9) Compliance / audit posture

For audit defensibility:

- Any value derived from par must be traceable to:
  - who set par
  - when par was set
  - mode in effect for the table/casino at that time
- Reports should be able to filter:
  - “exclude bootstrapped baselines”
  - “show only counted baselines”

# 10) Summary (the pit-floor version)

- **Default mode (Inventory Count):** PT wants a real count. If you don’t have one yet, PT can *temporarily* use the par target as a starting point, but it will mark it as “bootstrapped,” not a true count.
- **Imprest-to-Par:** Using par as the starting point is normal because the tray is expected to be at par when the shift starts.
- Either way, PT will never show “$0” just because the baseline is missing. It will show “N/A” and tell you what to do next.
