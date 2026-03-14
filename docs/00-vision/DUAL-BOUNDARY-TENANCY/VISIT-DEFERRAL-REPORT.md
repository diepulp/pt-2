The research surfaced three important findings. Here's the synthesis.

## Visit Deferral Verdict: Correct — but for stronger reasons than the optimization doc states

### 1. Visit Is Operational Telemetry, Not Presence Data

The `visit` table contains:

| Field | What it leaks cross-property |
|---|---|
| `gaming_day` | Regulatory date bucketing — reveals compliance-sensitive timing |
| `visit_kind` | `gaming_identified_rated` / `gaming_ghost_unrated` / `reward_identified` — reveals loyalty eligibility strategy |
| `started_at` / `ended_at` | Session duration, shift patterns — behavioral analysis |
| `visit_group_id` | Table-move continuity — internal operational grouping |

And critically, 5 child tables FK directly to `visit.id`:

| Child | Sensitivity |
|---|---|
| `rating_slip` | HIGH — table position, average bet, game settings |
| `loyalty_ledger` | HIGH — points accrual, campaign context |
| `pit_cash_observation` | CRITICAL — exact cash movements in cents |
| `player_financial_transaction` | CRITICAL — buy-in/cash-out amounts |
| `mtl_entry` | CRITICAL — AML compliance data |

Even without exposing children, a company-scoped `visit` read policy lets staff at Casino B infer Casino A's player traffic patterns, gaming day distribution, and session behavior. That's competitive intelligence between sister properties, not recognition context.

### 2. The Recognition Workflow Does NOT Need Visit

The three questions the workflow must answer:

| Question | Answered by |
|---|---|
| Does this player exist in the company? | `player` (already global, no policy change) |
| Where is the player enrolled? | `player_casino` (needs company-scoped read) |
| Is the player active at my casino? | `player_casino.status` at my `casino_id` |

None of these require `visit` data. The optimization doc is right on the minimal surface: `player` + `player_casino` is sufficient.

### 3. Host Context Can Be a Derived Scalar, Not Raw Table Access

The one legitimate "nice to have" is: *"When did this player last visit a sister property?"* — useful host context.

But this doesn't require a company-scoped read policy on `visit`. It requires a **derived scalar** in a recognition summary RPC:

```
rpc_lookup_player_company(p_search_term) returns:
  player_id, full_name, birth_date
  enrolled_casinos[]  (from player_casino)
  last_company_visit   (scalar timestamp, from SECURITY DEFINER aggregation)
  active_locally       (boolean)
```

The RPC computes `last_company_visit` inside a SECURITY DEFINER function — it reads visit data server-side and returns only the scalar. No RLS policy change on `visit`. No cross-property exposure of rows. The telemetry stays locked down.

This is the pattern the optimization doc hints at with `player_company_recognition_v` but doesn't fully substantiate.

### 4. The Real Discovery: Player Exclusion Is the Missing Surface

This is the finding the optimization doc doesn't cover, and it changes the Phase 2 recognition surface.

`player_exclusion` is **casino-scoped** (`casino_id` FK). Per ADR-042 D1, company-wide exclusions are deliberately deferred from MVP. This creates a safety gap:

```
Player banned at Casino A (hard_block)
  → walks into Casino B
  → Staff at Casino B does company-scoped lookup
  → System finds player, shows enrollment at Casino A
  → Staff sees NO exclusion warning (exclusions are casino-scoped)
  → System returns 'clear' for Casino B
  → Staff activates player locally
```

This is a **safety problem that the recognition workflow creates**. Before cross-property recognition, Casino B staff wouldn't even find this player. After recognition, they find the player but miss the ban. The recognition capability **expands the risk surface** for exclusion gaps.

**Recommendation**: The recognition summary RPC should include an `exclusion_flag` — not the full exclusion details (those are property-scoped operational/compliance data), but a boolean or severity signal:

```
has_sister_property_exclusions: true
max_exclusion_severity: 'hard_block' | 'soft_alert' | 'monitor' | null
```

This is computed inside the SECURITY DEFINER RPC (reads `player_exclusion` cross-company server-side, returns only a signal). No RLS policy change on `player_exclusion`. Staff at Casino B sees "this player has exclusions at a sister property" without seeing the details, jurisdiction, or reason — those remain property-scoped per ADR-042.

This isn't a convenience feature. It's a **safety obligation** that the recognition workflow creates by design.

---

## Revised Minimal Recognition Surface

| Surface | Mechanism | Phase 2 |
|---|---|---|
| `player` | Already global (no `casino_id`) | No change needed |
| `player_casino` | Company-scoped RLS read policy | YES — required |
| `visit` | Derived scalar via SECURITY DEFINER RPC | Scalar only (last_visit_timestamp) — no policy change |
| `player_exclusion` | Safety signal via SECURITY DEFINER RPC | Flag only (has_exclusions, max_severity) — no policy change |

**RLS policy changes required: ONE table** (`player_casino`). Everything else is handled by a SECURITY DEFINER recognition RPC that returns narrow, computed results.

This is tighter than even the optimization doc proposes — it replaces the "optional derived context" suggestion with a concrete pattern (SECURITY DEFINER scalar extraction) and adds the exclusion safety signal.

---

## Suggestions for the Optimization Doc

1. **Promote the derived summary RPC from "optional" to "required"** — it's the mechanism that makes visit deferral safe while preserving host context
2. **Add exclusion safety signal to the recognition surface** — this is a gap the current doc doesn't address, and it's the strongest argument for why recognition needs more than just `player` + `player_casino`
3. **Name the pattern**: "SECURITY DEFINER scalar extraction" — reads cross-company data server-side, returns only computed signals. No RLS policy broadening. This is the Phase 2 alternative to dual-mode RLS for sensitive tables.
4. **`player_financial_transaction` deferral is correct** — the optimization doc moves it out, and the research confirms it's CRITICAL-sensitivity casino-scoped accounting
