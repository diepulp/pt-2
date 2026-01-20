## Telemetry Semantics: "Grind" vs Rated Buy-in (Canonical)

### Terminology (Canonical)
The word **"grind"** is overloaded in operations. For the data pipeline and schema, we define it **strictly** by *identity/linkage*, not by amount.

**1) Threshold-based grind (rated, sub-$100)**
- Player **is identified** and **rated**
- `visit_id` and `rating_slip_id` **exist**
- Amount may be **below a mandatory logging/UI threshold**
- Still subject to Title 31/CTR monitoring at aggregate levels
- **Canonical classification:** **RATED_BUYIN** (amount does not change kind)

**2) Identity-based grind (unrated/anonymous)**
- No player record **or** player declines identification such that the session is not linkable
- `gaming_ghost_unrated` visit kind (ADR-014) OR an equivalent unlinked workflow
- Compliance-only observation (e.g., MTL/CTR monitoring)
- No loyalty accrual
- **Canonical classification:** **GRIND_BUYIN** (must remain unlinked)

**Shadow player (ADR-014)**
- Player exists but opts out of loyalty accrual
- **Not equivalent to anonymity**
- If `visit_id` + `rating_slip_id` exist → treated as **RATED_BUYIN**
- Loyalty opt-out is modeled outside telemetry (visit/loyalty), not by telemetry_kind

---

## Q2 Resolution: Schema Mismatch for Threshold-based Grind

### Current schema invariant (intent)
- `RATED_BUYIN` → **requires** `visit_id` AND `rating_slip_id`
- `GRIND_BUYIN` → **requires** `visit_id` AND `rating_slip_id` to be **NULL**

### Decision (Canonical)
We adopt option **(c)**:

> **Always use `RATED_BUYIN` whenever a rating slip exists, regardless of amount.**

Threshold-based grind (rated, sub-$100) is therefore **not** a telemetry grind; it is a **small rated buy-in** and must remain linkable for downstream analytics, reconciliation, and compliance aggregation.

### Non-goals / Rejected alternatives
- **(a) Add `RATED_GRIND_BUYIN`**: rejected as semantic duplication and taxonomy explosion driven by UI policy rather than domain truth.
- **(b) Relax `GRIND_BUYIN` to allow optional visit/slip linkage**: rejected because it destroys the interpretability of telemetry_kind and forces downstream queries to re-infer identity semantics.

---

## Data Pipeline Implications (Rundown → Shift Dashboards)

### Ingestion rules (Normative)
1. **If `rating_slip_id` exists** (player is rated/linked):
   - Emit `table_buyin_telemetry.kind = 'RATED_BUYIN'`
   - Populate `visit_id` and `rating_slip_id`
   - Amount may be any positive numeric, including sub-$100

2. **If no linkage exists** (identity-based grind):
   - Emit `table_buyin_telemetry.kind = 'GRIND_BUYIN'`
   - Enforce `visit_id IS NULL AND rating_slip_id IS NULL`

### UI guidance (Recommended)
To prevent operator confusion, consider renaming UI action:
- “Log Grind” → **“Log Unrated Buy-in”** (preferred)
If “grind” remains in UI, it MUST refer to **identity-based** grind only.

---

## Notes for Compliance & Aggregation
- Telemetry_kind is **not** a compliance classification; it is an operational ingestion category.
- Title 31/CTR monitoring occurs at aggregate levels and may require later identification—this does not retroactively change telemetry_kind.
