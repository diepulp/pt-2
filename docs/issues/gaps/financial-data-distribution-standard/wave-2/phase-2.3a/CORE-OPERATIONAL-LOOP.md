Now I have the full picture. Here's the execution plan.

---

## Core Operational Loop — Execution Plan

**Goal:** Certify all 6 producer paths, establish relay health baseline, detect any semantic drift, and produce a repeatable pilot demo script. Projection consumers (Phase 2.3/PRD-087) are not yet deployed — Layer 5 (consumer) validation is deferred; Layers 1–4 are the target.

---

### Phase 0 — Pre-Flight (one-time, before any producer runs)

**0a. Surface liveness check**
- Open `/admin/outbox-observability` as an admin staff user
- Confirm page renders without error and all 5 health metrics appear (even if all zero)
- Confirm Refresh button forces a fetch (network tab: `GET /api/internal/outbox-observability`)

**0b. Relay liveness baseline**
- Read `processed_count_24h` — if any workflows ran today, this must be > 0
- If 0 and no workflows have run yet: baseline is valid, proceed
- If 0 and workflows have run: relay may be down — investigate before certifying producers (Scenario 8c of the runbook)

**0c. Health card zero-state assertion**
Expected pre-test state:

| Metric             | Expected                       |
| ------------------ | ------------------------------ |
| Pending            | 0 or low, draining             |
| Oldest Pending Age | `—` (null)                     |
| Retry Pressure     | 0                              |
| Poison Candidates  | 0                              |
| Processed (24h)    | ≥ 0 (whatever baseline exists) |

Any pre-existing amber poison badge must be investigated and root-caused before producer runs begin — a dirty baseline poisons the certification signal.

---

### Producer Trigger Posture

Before running Phase 1, understand that the 6 producers fall into three categories with different triggering paths. The uniform "trigger in the application" instruction applies only to producers 3–4.

| Category | Producers | Trigger Surface | Status |
| -------- | --------- | --------------- | ------ |
| **A — Greenfield backend-only** | `fill.recorded`, `credit.recorded` | No UI exists. API route (`POST /api/v1/table-context/fills`, `/credits`) is wired for hardware integrations. Trigger via direct authenticated HTTP call. Proof scripts have zero coverage. | Backend correct; UI is future scope |
| **B — Orphaned component** | `grind.observed` | `GrindBuyinPanel` + `useLogGrindBuyin` hook exist but the component is not mounted in any page. Trigger via direct browser `supabase.rpc('rpc_log_table_buyin_telemetry', { p_telemetry_kind: 'GRIND_BUYIN', ... })` in an authenticated session, or mount the panel temporarily. | Component ready; not in page tree |
| **C — Application UI** | `buyin.recorded`, `cashout.recorded` | Standard operator workflow via the rating slip modal. | Full UI path available |
| **D — Known Layer 1 gap** | `adjustment.recorded` | UI exists (rating-slip modal + MTL compliance dashboard) but `original_txn_id` is never passed to the RPC. ADR-057 gate silently skips outbox emission — the PFT is written, the surface shows no row, no error is raised. Step 2 will always produce a Layer 1 failure in current state. | Gap documented: W2-OBS-ANCHOR-COVERAGE-001 / PROD-ANCHOR-STD-001 |

Category D means `adjustment.recorded` **cannot reach HEALTHY** under the current wiring. Do not mistake the clean observability surface for a passing result — silence is the failure mode. See Phase 5 for adjusted trust gate criteria.

---

### Phase 1 — Per-Producer Certification (run once per event type)

Run the core validation loop for each of the 6 event types in this order. The sequence moves from simplest (table-level, no player attribution) to most complex (player-attributed, rated-play).

| Order | Event Type            | Workflow Action                    | Expected `fact_class` | Expected `origin_label` | Expected `player_id`     | Trigger Category |
| ----- | --------------------- | ---------------------------------- | --------------------- | ----------------------- | ------------------------ | ---------------- |
| 1     | `fill.recorded`       | Table fill (chips: cage → table)   | `operational`         | `estimated`             | `—` (null — table-level) | A — direct API   |
| 2     | `credit.recorded`     | Table credit (chips: table → cage) | `operational`         | `estimated`             | `—` (null — table-level) | A — direct API   |
| 3     | `buyin.recorded`      | Player buy-in                      | `ledger`              | `actual`                | required                 | C — UI           |
| 4     | `cashout.recorded`    | Player cashout                     | `ledger`              | `actual`                | required                 | C — UI           |
| 5     | `adjustment.recorded` | Chip adjustment                    | `ledger`              | `actual`                | required                 | D — known gap    |
| 6     | `grind.observed`      | Grind/rated play observation       | `operational`         | `observed`              | `—` (null — table-level) | B — orphaned component |

**For each event type, execute these 7 steps:**

**Step 1 — Trigger the workflow action** using the path appropriate to the producer's trigger category:

- **Category A** (`fill.recorded`, `credit.recorded`): Issue an authenticated `POST` to `/api/v1/table-context/fills` or `/credits` with a valid staff JWT. Include `table_id`, `amount_cents`, `delivered_by`, `received_by`, `slip_no`, and a unique `request_id`. An active table session must exist. This exercises the full server-mediated chain.
- **Category B** (`grind.observed`): From an authenticated browser session, call `supabase.rpc('rpc_log_table_buyin_telemetry', { p_table_id, p_amount_cents, p_telemetry_kind: 'GRIND_BUYIN', p_source: 'pit_manual', p_idempotency_key })`. Alternatively, temporarily mount `GrindBuyinPanel` into any table-context page.
- **Category C** (`buyin.recorded`, `cashout.recorded`): Trigger via the normal operator workflow in the application.
- **Category D** (`adjustment.recorded`): Trigger via the rating-slip modal adjustment flow or MTL compliance dashboard. **Expected outcome: no outbox row is written.** Proceed directly to the Layer 1 failure diagnosis — this is a known, documented gap, not an environment issue.

**Step 2 — Open the surface, click Refresh.** Verify the event row appears. If no row: Layer 1 failure (producer RPC did not write to `finance_outbox`). Stop and diagnose.

**Step 3 — Semantic envelope check** (expand the row):

| Field          | Pass condition                                | Fail action                                   |
| -------------- | --------------------------------------------- | --------------------------------------------- |
| `event_type`   | Matches the workflow type in the table above  | → Layer 3: producer authored wrong type       |
| `fact_class`   | Matches expected column above                 | → Layer 3: producer used wrong classification |
| `origin_label` | Matches expected column above                 | → Layer 3: producer used wrong provenance     |
| `player_id`    | UUID for player events; `—` for fill/credit   | → Layer 3: attribution error                  |
| `table_id`     | Correct table UUID (cross-reference workflow) | → Layer 3: wrong context                      |
| `aggregate_id` | Visit UUID or shift UUID (match workflow)     | → Layer 3: wrong aggregate scope              |
| `payload`      | Amounts/chip values match what was entered    | → Layer 3: payload authoring error            |

**Step 4 — Wait up to 60s, click Refresh.** Verify `processed_at` transitions from "pending" badge to a relative timestamp. If still pending after 60s: Layer 2 failure — check Oldest Pending Age metric and relay liveness.

**Step 5 — Relay quality check:**
- `delivery_attempts` = 0: clean first-pass delivery ✓
- `delivery_attempts` = 1–2: relay retried — check `last_error` (Failing status)
- `delivery_attempts` ≥ 3: poison candidate — expand row, read `last_error`, identify root cause category per Scenario 8c

**Step 6 — Health card post-check.** After relay processes the row, verify Pending count drops back and Poison Candidates remains 0.

**Step 7 — Record outcome.** One of:
- `HEALTHY`: row exists, envelope correct, `processed_at` set, `delivery_attempts` = 0
- `STALLED`: row exists, `processed_at` null after 2+ minutes
- `FAILED`: `delivery_attempts` ≥ 3, `processed_at` null
- `ENVELOPE_DRIFT`: row exists and relayed, but a semantic field is wrong

---

### Phase 2 — Semantic Drift Detection Pass

After all 6 producers are certified individually, run a cross-producer drift check.

**2a. Comparative envelope audit**
Filter by each `event_type` in turn, spot-check 3–5 rows from different sessions/tables. Confirm:
- No `origin_label` value appears on the wrong producer (e.g., `estimated` on a `buyin.recorded` row would be a drift signal)
- No `fact_class` value appears on the wrong producer (e.g., `operational` on a `cashout.recorded` row)
- `player_id` is consistently null on `fill.recorded` and `credit.recorded`, consistently present on the 4 player-attributed types

**2b. ADR-054 D5 display verification**
All 4 `origin_label` values (`actual`, `estimated`, `observed`, `compliance`) must render as identical neutral badges — no color difference, no visual weight difference between them. If any badge shows color progression or styling that implies a quality ranking, this is a display-layer violation of ADR-054 D5.

**2c. Replay ordering spot-check** (Scenario 8e)
Perform two consecutive fills on the same table. Verify:
- Two rows with distinct UUIDv7 `event_id` values appear
- UUIDv7 lexicographic order matches `created_at` chronology
- Both rows reach `processed_at`
- No duplicate delivery (relay idempotency intact)

---

### Phase 3 — Layer Isolation Protocol (on-demand for any failure)

When any step above produces a non-HEALTHY outcome, collapse the failure space using this decision tree — stop at the first failing layer:

```
Layer 1 — Producer:  Event row present?
  NO → producer RPC did not write. Check workflow save, RPC inclusion, transaction rollback.

Layer 2 — Transport: processed_at set?
  NO after 60s → relay not cycling. Check Oldest Pending Age. Investigate relay worker.

Layer 3 — Semantic:  event_type / fact_class / origin_label correct?
  NO → producer authored bad envelope. Check authoring RPC, ADR-052 attribution arguments.

Layer 4 — Relay:     delivery_attempts > 0?
  YES → consumer throwing. Expand row. Read last_error. Fix consumer.
  ≥ 3 → poison. Consumer consistently failing. Root cause: consumer exception / not deployed / infra.

Layer 5 — Consumer:  Deferred (Phase 2.3/PRD-087 projection consumers not yet live).
```

---

### Phase 4 — Pilot Demo Script (repeatable, <5 minutes)

This is the script that demonstrates causal coherence to stakeholders. Run this end-to-end during any pilot demo session.

1. **Open** `/admin/outbox-observability`. Show the Relay Health Card at rest (all zeros or low baseline).
2. **Perform a live buy-in** for a player at a table.
3. **Click Refresh** on the surface immediately after save.
4. **Point to the new row** in the event table: `event_type = buyin.recorded`, `processed_at` showing "pending".
5. **Expand the row.** Walk through: `fact_class = ledger`, `origin_label = actual`, `player_id` is the player, `aggregate_id` is the visit, `payload` shows the amount entered.
6. **Wait ~30s, click Refresh again.** `processed_at` now shows a relative timestamp. `delivery_attempts = 0`.
7. **Return to health card.** Processed (24h) has incremented by 1. Pending count is back to 0 (or draining).

**Talking points for the demo:**
- "The row appeared the moment the workflow saved — authored transactionally, not asynchronously"
- "The semantic envelope — who, what kind, from what provenance — is immutable from the point of authoring"
- "Relay picked it up and committed delivery within one cycle. We can see that confirmed here."
- "If delivery had failed, we'd see an amber badge and a `last_error` message, not silence."

---

### Phase 5 — Operational Trust Gate

**Operational trust is established when:**

| Criterion                                                     | Evidence                                                   | Notes |
| ------------------------------------------------------------- | ---------------------------------------------------------- | ----- |
| Producers 1–2 certified HEALTHY via direct API call           | `fill.recorded` and `credit.recorded` rows present, relayed | Category A — no UI; API call is the canonical trigger |
| Producer 3 certified HEALTHY via UI workflow                  | `buyin.recorded` row present, envelope correct, relayed    | |
| Producer 4 certified HEALTHY via UI workflow                  | `cashout.recorded` row present, envelope correct, relayed  | |
| Producer 5 diagnosed as Layer 1 gap (not HEALTHY)            | Step 2 confirms no row written; root cause: W2-OBS-ANCHOR-COVERAGE-001 | PROD-ANCHOR-STD-001 governs remediation path |
| Producer 6 certified HEALTHY via direct RPC or mounted panel  | `grind.observed` row present, envelope correct, relayed    | Category B — GrindBuyinPanel not mounted; use direct RPC |
| Zero envelope drift detected across certified producers       | No mismatched `fact_class` / `origin_label` rows found     | |
| Relay processes all test events within one cycle (~30s)       | `processed_at` consistently set within 60s                 | |
| No poison candidates generated by producer certification runs | `poison_candidate_count` = 0 throughout                    | |
| UUIDv7 replay ordering verified                               | Two-fill test: correct lexicographic order, both processed | |
| Pilot demo script run successfully end-to-end                 | Demo outcome: HEALTHY (`buyin.recorded` path)              | |

**Adjusted trust gate rationale:** The original criterion of "6 × HEALTHY" is not achievable in the current state for `adjustment.recorded` (Category D gap) or via UI workflows for `fill.recorded`, `credit.recorded`, and `grind.observed` (Categories A and B). The gate above reflects what the system can certify honestly:

- 5 producers reachable and certifiable (4 HEALTHY, 1 diagnosed gap)
- 1 producer (`adjustment.recorded`) formally recorded as Layer 1 gap pending PROD-ANCHOR-STD-001 remediation

The surface is operationally trusted for the certified producers when all rows in the table above pass. Phase 2.3 (PRD-087, Lifecycle-Aware Completeness Projection) may proceed with the understanding that `adjustment.recorded` coverage is partial until the anchor resolution standard is enforced. The Layer 5 (consumer) column of the layer isolation protocol will be activatable once PRD-087 projection consumers are deployed.

---

**What's not in scope here:** No write actions, no replay, no repair, no projection rebuild. The containment boundary (FIB-H-W2-OUTBOX-OBS-001) is preserved throughout. Any failure found surfaces only a diagnosis — the fix lives in the producer RPC or consumer code, not on this surface.