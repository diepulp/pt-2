# Outbox Observability — Operational Runbook

**Surface:** `/admin/outbox-observability`
**Auth:** Admin staff role required. `casino_id` is derived from the confirmed `staff` row — no query param override is possible.
**Data freshness:** TanStack Query `staleTime: 30s`. Use the **Refresh** button to force an immediate fetch.
**Scope:** Read-only. No replay, retry, repair, or write action exists anywhere on this surface.

---

## 1. Surface Layout

```
┌─────────────────────────────────────────────────────┐
│  Relay Health Card   (five aggregate metrics)       │
├─────────────────────────────────────────────────────┤
│  Filter Bar          (event type / status / UUID)   │
├─────────────────────────────────────────────────────┤
│  Event Table         (paginated, click to expand)   │
│    └─ Row Detail     (full envelope + payload)      │
└─────────────────────────────────────────────────────┘
```

---

## 2. Relay Health Card Reference

| Metric | Source | Healthy signal | Warning signal |
|---|---|---|---|
| **Pending** | `processed_at IS NULL` | Low / draining over time | Persistently non-zero after relay cycle |
| **Oldest Pending Age** | seconds since oldest unprocessed `created_at`; null when no pending rows | `—` or short duration | Growing age (minutes+) |
| **Retry Pressure** | `delivery_attempts >= 1 AND processed_at IS NULL` | 0 | Any non-zero; growing means relay is retrying without success |
| **Poison Candidates** | `delivery_attempts >= 3 AND processed_at IS NULL` | 0 | Any non-zero → amber accent; these rows are stuck |
| **Processed (24h)** | `processed_at IS NOT NULL` within last 24 hours | Proportional to workflow activity | 0 when workflows have run — relay may be down |

> **Poison threshold:** `delivery_attempts >= 3` is a display heuristic for operational visibility. It has no routing consequence and does not move rows to a dead-letter store.

---

## 3. Core Validation Loop

Use this loop for every producer certification, projection debugging pass, or post-deploy smoke check.

```
1. Perform workflow action (buy-in, cashout, adjustment, fill, credit, grind observation)
2. Open /admin/outbox-observability → click Refresh
3. Verify row exists in event table
4. Verify semantic envelope fields (see §4)
5. Verify relay progression (processed_at set, delivery_attempts = 0)
6. If projection consumer exists: verify derived state in projection surface
7. Record outcome: HEALTHY / STALLED / FAILED
```

---

## 4. Producer Verification Checklist

After performing a real workflow action, expand the matching event row and verify each field:

| Field | What to verify | Where it appears |
|---|---|---|
| `event_type` | Matches the workflow: `buyin.recorded`, `cashout.recorded`, `adjustment.recorded`, `grind.observed`, `fill.recorded`, `credit.recorded` | Table column + row detail |
| `fact_class` | `ledger` for financial transactions; `operational` for structural observations | Badge in table |
| `origin_label` | `actual` for confirmed cash; `estimated` for rated play; `observed` for grind; `compliance` for regulatory | Badge in table |
| `player_id` | Correct player UUID; `—` only for table-level events (fills, credits) | Table column + row detail |
| `table_id` | Correct table UUID | Table column (truncated) + row detail (full) |
| `aggregate_id` | Visit UUID or shift UUID depending on event scope | Row detail only |
| `casino_id` | Your casino; never from request input | Row detail only |
| `processed_at` | Set (relative time) once relay has picked up the row; "pending" badge while unprocessed | Table column |
| `delivery_attempts` | `0` on first successful relay pass; `1+` means relay needed retries | Table column |
| `payload` | Full authored payload — verify amounts, chip colors, or observation values are correct | Row detail expand → `<pre>` block |

> **ADR-054 D5 constraint:** `origin_label` and `fact_class` are rendered exactly as stored. The surface performs no visual upgrade or color progression between label values. If a label looks wrong, the authoring producer is the source — not the display layer.

---

## 5. Status Filter Usage

| Filter | What it shows | When to use |
|---|---|---|
| **All** | Every row regardless of relay state | Default; overview |
| **Pending** | `processed_at IS NULL AND delivery_attempts < 3` | Confirm relay is draining; check for stuck-but-not-yet-poison rows |
| **Processed** | `processed_at IS NOT NULL` | Confirm a specific workflow's event was successfully relayed |
| **Failing** | `processed_at IS NULL AND delivery_attempts >= 1 AND < 3` | Early retry pressure; investigate before rows reach poison threshold |
| **Poison Candidate** | `processed_at IS NULL AND delivery_attempts >= 3` | Stuck rows requiring investigation; amber badge appears in health card |

> A row cannot be both **Failing** and **Poison** — the boundary is exactly `delivery_attempts = 3`.

---

## 6. UUID Search

The search field accepts a single UUID and matches any of: `event_id`, `aggregate_id`, or `table_id`.

**Usage patterns:**

- **Trace a specific event:** paste the `event_id` from a test harness or log output
- **Trace all events for a visit:** paste the `aggregate_id` (visit UUID)
- **Trace all events at a table:** paste the `table_id`

Input must be a valid UUID (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). A "Must be a valid UUID" inline error appears if the format is wrong. The search commits on form submit — not on keystroke.

---

## 7. Layer Isolation: Debugging a Stale or Incomplete Projection

When a downstream projection shows `completeness.status = partial` or a dashboard reads stale, use the surface to collapse the failure search space to a single layer:

```
Layer 1 — Producer:    Does the event row exist in the table?
                       → No row: producer did not fire. Check RPC, trigger, or workflow action.

Layer 2 — Transport:   Is processed_at set?
                       → pending: relay has not picked it up yet (normal if recent) or relay is down.
                       → still pending after 60s+: check relay liveness (Oldest Pending Age metric).

Layer 3 — Semantic:    Are event_type, fact_class, origin_label correct?
                       → Wrong label: producer authored bad envelope. Check authoring RPC.

Layer 4 — Relay:       delivery_attempts > 0?
                       → Retrying: relay is reaching the row but consumer is throwing. Check last_error.
                       → delivery_attempts >= 3: poison candidate. Consumer or idempotency issue.

Layer 5 — Consumer:    All layers above are clean but projection is still wrong.
                       → Isolated to the projection/consumer logic. Transport is confirmed healthy.
```

---

## 8. Scenario Playbooks

### 8a. Workflow ran but no event row appears

1. Filter by `event_type` matching the workflow.
2. Set status to **All**. Click Refresh.
3. If still no row: the producer RPC did not write to `finance_outbox`. Check:
   - Was the workflow action saved (form submitted, DB record created)?
   - Does the authoring RPC include the `finance_outbox` insert?
   - Did a transaction rollback occur (check application error logs)?
4. Do not assume relay failure — no row means no event was authored.

### 8b. Event row exists but `processed_at` is null

1. Check **Oldest Pending Age** in the health card.
   - Under 30s: relay may not have cycled yet. Wait and refresh.
   - Over 2 minutes: relay is not claiming this row. Relay process may be down or claim cycle is stalled.
2. Check `delivery_attempts`:
   - `0`: relay has not attempted it yet.
   - `1–2` (Failing): relay attempted but the consumer threw. Expand the row and read `last_error`.
   - `3+` (Poison): relay has given up retrying. Expand the row and read `last_error` for root cause.

### 8c. Poison candidate appears (amber badge in health card)

1. Set status filter to **Poison Candidate**.
2. For each row: expand and read `last_error`. Common causes:
   - Consumer-side exception (idempotency check failed, schema mismatch)
   - Consumer not yet deployed for this event type (Phase 2.3 projections may not exist yet)
   - Constraint violation in the consumer's write path
3. The surface shows the diagnosis. Resolution requires fixing the consumer, not the outbox row. No mutation action exists on this surface — that is by design.

### 8d. Wrong `origin_label` or `fact_class` on a row

1. Expand the row. Confirm the authored values in the detail panel.
2. The display layer renders the stored value unchanged. If the label is wrong, the producer RPC authored it incorrectly.
3. Check the authoring RPC for the event type in question — verify the `fact_class` and `origin_label` arguments match the ADR-052 attribution rules.
4. Check `payload` for corroborating evidence (e.g., an `estimated` amount that should be `actual`).

### 8e. Validating replay ordering or duplicate suppression

1. Perform the same workflow action twice (e.g., two consecutive fills on the same table).
2. Filter by `event_type: fill.recorded` and optionally search by `table_id`.
3. Verify:
   - Two distinct rows exist with different `event_id` values (UUIDv7 — lexicographically ordered by creation time)
   - `created_at` timestamps are in the correct chronological order
   - Both rows reach `processed_at` (relay processed both)
   - Consumer idempotency: if the projection is sum-based, each `event_id` should appear at most once in the projection's receipt store
4. Check `delivery_attempts` — a second delivery attempt on an already-processed row indicates idempotency handling is working correctly if `processed_at` was already set.

---

## 9. Repeat Validation Steps for New Producers

Every time a new producer, projection, lifecycle signal, completeness transition, or telemetry source is introduced, run this checklist immediately after performing a real workflow action:

- [ ] Row exists in event table
- [ ] `event_type` matches expected value
- [ ] `fact_class` matches ADR-052 attribution (`ledger` / `operational`)
- [ ] `origin_label` matches provenance (`actual` / `estimated` / `observed` / `compliance`)
- [ ] `player_id` correctly set (or `—` for non-player-scoped events)
- [ ] `table_id` correctly set
- [ ] `processed_at` set after relay cycle
- [ ] `delivery_attempts = 0` (clean first-pass delivery)
- [ ] Poison badge absent
- [ ] Payload values match the workflow input

---

## 10. Hard Boundaries — What This Surface Cannot Do

| Action | Status |
|---|---|
| Replay an event | Not available — no replay button exists anywhere |
| Retry a failing or poison row | Not available — relay retries autonomously |
| Mutate `finance_outbox` rows | Not available — surface is GET-only, no DML path |
| Repair a projection | Not in scope — projection repair requires a separate consumer/reconciliation slice |
| Route a poison row to a dead-letter store | Not available — dead-letter routing is deferred to a later reliability slice |
| View events across casinos | Not available — `casino_id` is derived from the authenticated admin's staff row |
| Real-time / live-polling mode | Not available — 30s stale time; use manual Refresh |

**Expansion rule (FIB-H-W2-OUTBOX-OBS-001 §K):** Any proposal to add a write action against `finance_outbox`, a replay/repair/retry workflow, an external notification channel, a public event API, or projection drift repair requires a new FIB intake and explicit amendment. The containment boundary is currently intact. Protect it.

---

## 11. API Reference (for direct testing or tooling)

```
GET /api/internal/outbox-observability
```

**Auth:** Must be authenticated as an active admin staff member (401/403 otherwise).

**Query parameters:**

| Param | Type | Values | Default |
|---|---|---|---|
| `event_type` | string | `buyin.recorded`, `cashout.recorded`, `adjustment.recorded`, `grind.observed`, `fill.recorded`, `credit.recorded` | all types |
| `status` | string | `all`, `pending`, `processed`, `failing`, `poison` | `all` |
| `search_id` | UUID | any valid UUID | none |

**Response shape:**
```json
{
  "health": {
    "pending_count": 0,
    "oldest_pending_age_seconds": null,
    "retry_row_count": 0,
    "poison_candidate_count": 0,
    "processed_count_24h": 42
  },
  "events": [
    {
      "event_id": "...",
      "event_type": "fill.recorded",
      "fact_class": "ledger",
      "origin_label": "actual",
      "casino_id": "...",
      "table_id": "...",
      "player_id": null,
      "aggregate_id": "...",
      "created_at": "...",
      "processed_at": "...",
      "delivery_attempts": 0,
      "last_attempted_at": null,
      "last_error": null,
      "payload": {}
    }
  ]
}
```

**Error codes:** `400` (invalid `status` or malformed `search_id`), `401` (no session), `403` (not admin), `500` (RPC failure with `safeErrorDetails`).

---

## 12. Governing References

| Reference | Purpose |
|---|---|
| ADR-052 | Financial Fact Model — `fact_class` and `origin_label` attribution rules |
| ADR-054 | Financial Event Propagation & Surface Contract — `origin_label` immutability (D5) |
| ADR-056 | Outbox write-path governance — SECURITY DEFINER enforcement |
| ADR-024 | Authoritative context derivation — `casino_id` from staff row, never request input |
| FIB-H-W2-OUTBOX-OBS-001 | Scope authority for this surface — governs expansion triggers |
| PRD-086 précis | Full implementation detail: RPCs, DTOs, route, component decisions |
