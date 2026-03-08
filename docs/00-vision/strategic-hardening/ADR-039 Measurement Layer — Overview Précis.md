Now I have a comprehensive picture. Here's the overview:

---

# ADR-039 Measurement Layer — Overview Précis

**Commit:** `c298cce` (feat(EXEC-045): ADR-039 measurement layer)
**Scope:** 5 SQL migrations, SRM bump to v4.18.0, seed data updates, type regeneration

## What Was Built

This commit activates the **Measurement Layer** — a cross-cutting database infrastructure that transforms PT-2's latent structural advantages into queryable, demonstrable proof points. The system already computed financial truth deterministically; now it can *prove* what that truth reveals.

### Four Artifacts Shipped

| # | Artifact | Type | What It Does |
|---|----------|------|-------------|
| 1 | `rating_slip.legacy_theo_cents` + `computed_theo_cents` | 2 columns + index | Stores legacy-reported theo alongside PT-2's deterministic computation at slip close. Enables discrepancy detection: *"Legacy said $X, PT-2 computes $Y."* |
| 2 | `measurement_audit_event_correlation_v` | SQL view (`security_invoker=true`) | Joins `rating_slip → player_financial_transaction → mtl_entry → loyalty_ledger` in one query. Collapses hours of manual audit reconciliation into seconds. |
| 3 | `measurement_rating_coverage_v` | SQL view (`security_invoker=true`) | Per-table-session time accounting: `open_seconds`, `rated_seconds`, `untracked_seconds`, `rated_ratio`. Makes rating gaps visible as a measurable metric. |
| 4 | `loyalty_valuation_policy` + `loyalty_liability_snapshot` + `rpc_snapshot_loyalty_liability` | 2 tables + SECURITY DEFINER RPC | Daily snapshots of total outstanding loyalty points, estimated dollar value (using versioned valuation policy), and player count per casino. Idempotent UPSERT. |

### Key Technical Details

- **Theo materialization (D3):** `computed_theo_cents` is now calculated and stored at slip close in all three closing RPCs (`rpc_close_rating_slip`, `rpc_move_player`, `rpc_start_or_resume_visit`). A CHECK constraint enforces that closed slips always have a theo value.
- **Cross-context governance (D4):** The two views span bounded context boundaries (a governed SRM exception). `security_invoker=true` ensures the caller's RLS policies apply — no privilege escalation.
- **Valuation policy separation:** Loyalty dollar estimates use a versioned `loyalty_valuation_policy` table (not a settings field), so snapshots are reproducible even if the policy changes later.

## Value Proposition

### For Marketing / Sales

These artifacts close the gap between *"PT-2 computes correctly"* and *"PT-2 can show you things your legacy system cannot."* Specifically:

| Structural Advantage | What PT-2 Now Proves | Legacy Cannot |
|---|---|---|
| **Theo integrity** | Surface discrepancies between legacy-reported and deterministically computed theo | Opaque calculation layers hide the truth |
| **Audit traceability** | Trace any financial event end-to-end (slip → txn → MTL → loyalty) in one query | Hours of manual reconciliation across disconnected systems |
| **Rating coverage** | Measure what % of table-hours have rating data — quantify the invisible gap | Unrated table-hours are silent voids — the gap doesn't exist in their data |
| **Loyalty liability** | Daily computed liability to the cent, with historical trend | Estimated quarterly from spreadsheets at best |

**The one-sentence pitch:**
> *"PT-2 surfaces theo discrepancies hidden by opaque legacy reporting, traces financial events end-to-end in seconds, measures rating coverage that legacy systems cannot see, and computes daily reward liability to the dollar — capabilities structurally impossible in the systems it replaces."*

### Economic Impact (from Strategic Hardening Report)

These artifacts support the $600K–$800K operational + compliance value claim within 90 days, with a path to $1M+ by 12 months — particularly the audit efficiency (Wedge B) and loyalty determinism (Wedge D) components.

## Where Are the UI Surfaces?

**This commit is infrastructure-only. No frontend pages consume these artifacts yet.** The data is live in the database and accessible via SQL and PostgREST, but the UI wiring is deferred to future work.

### Current state of likely UI homes:

| Measurement Artifact | Likely UI Location | Current Status |
|---|---|---|
| Theo discrepancy analysis | `/admin/reports` | **Placeholder page exists** — "Coming soon" |
| Audit event correlation | `/admin/reports` | Same placeholder — needs a query/table component |
| Rating coverage metrics | `/admin/reports` or shift dashboard | No component yet |
| Loyalty liability snapshots | `/admin/reports` | No component yet; `loyalty_liability_snapshot` table ready for a trend chart |
| Valuation policy management | `/admin/settings` | No UI yet; settings page infrastructure exists from PRD-042 |

### What's Queryable Now (for testing / demo)

All four artifacts can be exercised directly via Supabase Studio or PostgREST:

```sql
-- 1. Theo discrepancy (requires legacy data import)
SELECT AVG(ABS(computed_theo_cents - legacy_theo_cents)::numeric
           / NULLIF(legacy_theo_cents, 0))
FROM rating_slip WHERE legacy_theo_cents IS NOT NULL AND status = 'closed';

-- 2. Audit event correlation (end-to-end financial lineage)
SELECT * FROM measurement_audit_event_correlation_v
WHERE rating_slip_id = '<some-slip-id>';

-- 3. Rating coverage per table session
SELECT casino_id, gaming_day, AVG(rated_ratio) AS avg_coverage
FROM measurement_rating_coverage_v
GROUP BY casino_id, gaming_day;

-- 4. Loyalty liability snapshot (call the RPC first to generate)
SELECT rpc_snapshot_loyalty_liability();  -- creates today's snapshot
SELECT * FROM loyalty_liability_snapshot ORDER BY snapshot_date DESC;
```

### Next Steps for UI

Future PRDs should wire these into the `/admin/reports` page (the route and layout guard already exist). The type definitions are generated and available in `types/database.types.ts` — frontend service modules, hooks, and components need to be built to consume:
- `Database['public']['Views']['measurement_audit_event_correlation_v']`
- `Database['public']['Views']['measurement_rating_coverage_v']`
- `Database['public']['Tables']['loyalty_liability_snapshot']`
- `Database['public']['Tables']['loyalty_valuation_policy']`
- `Database['public']['Functions']['rpc_snapshot_loyalty_liability']`