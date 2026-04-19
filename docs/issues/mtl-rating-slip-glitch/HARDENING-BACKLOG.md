# MTL Buy-In Glitch — Hardening Backlog & Remediation Direction

**Last updated:** 2026-04-17 · **Status of PRD-064 containment:** shipped `3839ba9b` + `f2327702` + `c8c6d301` · **Source fold-in:** PRD-064 §2.3 deferrals, [`PRD-065-DEFERRAL-RATIONALLE.md`](./PRD-065-DEFERRAL-RATIONALLE.md), [`DOWNSTREAM-CONSUMER-POSTURE.md`](./DOWNSTREAM-CONSUMER-POSTURE.md), [`POST-IMPL-PRECIS.md`](./POST-IMPL-PRECIS.md).

---

## 1. What the backlog is

PRD-064 closed the **write-path operator-visible atomicity** race: operator-sees-success ⇒ server-wrote. It deferred nine items to §2.3 as "next hardening pass." Two parallel investigations since then expanded the picture:

- `PRD-065-DEFERRAL-RATIONALLE.md` — ADR-049 composite-mutation collapse is *deferred, trigger-gated* while Wedge C / CI/CD outrank architectural hardening on a contained surface.
- `DOWNSTREAM-CONSUMER-POSTURE.md` — the server bridge is GREEN; the remaining correctness gap is read-plane: asymmetric cache invalidation across three write hooks and four missing realtime subscriptions.

This document consolidates every open item across all three sources, ranks them by consequence, and names the implementation phases.

---

## 2. What shipped since PRD-064

| Commit | What it closed | Source |
|---|---|---|
| `3839ba9b` | PRD-064 containment slice (P0.1–P0.3, P1.4, `INV-MTL-BRIDGE-ATOMICITY`) | PRD-064 |
| `f2327702` | **Bug A** (date-nav off-by-one in LA TZ) + **Bug B** (compliance-dashboard default gaming day → `useGamingDay()`) | Closes §2.3 item "Gaming-day default via casino-TZ API" |
| `c8c6d301` | `no-temporal-bypass` ESLint rule extended to `components/`; new date-fns `format(new Date(), '<date>')` AST pattern; 3 sibling bypass sites fixed (`shift-dashboard/alerts-panel`, `admin-alerts/alerts-page-client`, `admin/valuation-settings-form`) | Net-new hardening beyond PRD-064 scope |

---

## 3. Ranked backlog

### Magnitude axes
- **Correctness** — silent vs loud, data loss vs UI lag, DB-truth vs UI-truth
- **Compliance surface** — does stale/missing state risk a reporting obligation
- **Frequency** — every save, every shift, only on close-session
- **Cost** — 3-line patch vs coordinator-RPC + SRM amendment
- **Trigger-gated** — waits on an observed incident (R1/R2/R3/R5) vs do now

### Ranking

| # | Item | Correctness | Compliance | Cost | Trigger-gated | Magnitude | Issue ID |
|---|---|---|---|---|---|---|---|
| **H1** | Silent `modalData` guard in `handleSave` (audit-flagged real defect) | High — silent data loss | Yes (MTL write missed) | Single-file, ~5 lines | No | **P0** | `ISSUE-BDD7B21D` |
| **H2** | Write-hook cache invalidation asymmetry across 3 hooks + close-session (folds §2.3 `mtlKeys` on close-session) | Medium — UI lags up to 60s | Indirect (floor decisions) | 3 hooks × ~3 calls | No | **P0** | `ISSUE-BB4BB277` |
| **H3** | Dashboard realtime missing subs on `mtl_entry`, `table_buyin_telemetry`, `pit_cash_observation`, `shift_anomaly_alert` (folds §2.3 "Realtime on `mtl_entry`") | Medium — cross-operator visibility | Low | Moderate — 4 subs + cache-match | No | **P1** | `ISSUE-59FF2387` |
| **K** | Sibling-hook composite-shape audit (`use-close-with-financial`, `use-move-player`) — feeds ADR-049 R2 watchlist | N/A | N/A | ~1hr | No | **P2** | — |
| **H4** | Decide polling vs realtime for `shift_anomaly_alert` (sub-task of H3) | Low | Low | Design decision, small | Implied by H3 | **P2** | — |
| **F** | PRD-065 / ADR-049 composite-mutation collapse (save-with-buyin → coordinator RPC) | High if triggered | High if triggered | Large: new SECURITY DEFINER RPC + SRM v4.12 + route + hook rewrite + E2E rewrite | **Yes** — R1/R2/R3/R5 | **P2 gated** | — |
| **G** | Chips-taken / `pit_cash_observation` semantic-boundary ADR (→ ADR-050) | Indirect | Medium (MTL semantic boundary) | Large — ADR + migration path | No, parallel | **P3** | — |
| **I1** | Mixed-unit test fixture cleanup (`gaming_day = 2026-04-09`) | None (test hygiene) | None | Small | No | **P3** | — |
| **I2** | `data-testid` restoration on pit-panels | None (E2E stability) | None | Small | No | **P3** | — |
| **J** | CTR/SAR threshold-message content expansion | None | Product UX | Medium — needs product direction | No | **P3** | — |

---

## 4. Phases & sequencing

### Phase H — "PRD-064 Hardening Pass 2"

Extends the PRD-064 containment thesis on both sides of the write:
- PRD-064 closed: operator-sees-success ⇒ server-wrote.
- **H1** closes the symmetric write-path silent failure: operator-sees-nothing-and-nothing-wrote (but operator thinks something happened).
- **H2 + H3** close the read-plane mirror: server-wrote ⇒ all UI surfaces catch up, without 60s staleness or window-focus dependency.

**Natural packaging (per DOWNSTREAM-CONSUMER-POSTURE's "do not conflate with PRD-065"):**

```
PRD-066 — Save-with-buyin write-path hardening pass 2  (H1 — does this need a PRD?)
  • Single-file fix in components/modals/rating-slip/rating-slip-modal.tsx
  • Likely ships as direct commit + unit test, no PRD required
  • Grows into PRD only if the root-cause fix reaches the fetch/cache layer

PRD-067 — MTL bridge read-plane coherence                (H2 + H3 + H4)
  • WS1: Invalidation on 3 write hooks + close-session             [H2, P0]
  • WS2: Realtime subs on 4 tables                                  [H3, P1]
  • WS3: Polling-vs-realtime decision for shift_anomaly_alert       [H4, P2]
```

Both stay narrow: no SRM changes, no new RPCs, no new SECURITY DEFINER, no RLS changes. That's the qualifier for "do now" vs PRD-065's "gated."

### Phase K — cheap investigation

~1 hour audit of `use-close-with-financial` + `use-move-player` for the same composite-client-mutation shape. Output: one note on `ADR-049` R2 watchlist. Zero implementation; cheap insurance that the first R2 incident flips PRD-065 to "do now" with the right scope (all three composite surfaces packaged under one coordinator, not just save-with-buyin).

### Phase F — gated

PRD-065 stays draft-frozen. Flip to "do now" when any of these fire:

| Trigger | Signal |
|---|---|
| R1 | Second production glitch on any composite-client-mutation surface (save-with-buyin, move-player, close-session) |
| R2 | Observed split-brain between sibling mutations (e.g. avg-bet succeeds, buy-in aborts) |
| R3 | MTL bridge goes async (breaks single-transaction assumption) |
| R5 | Commit-barrier discipline regresses on a refactor (operator gets a dismissible state mid-save again) |

Until a trigger fires, spend the cycles on Wedge C baseline and CI/CD infrastructure.

### Phase G and below

- **G** (ADR-050 chips-taken boundary) — on own cadence; likely wakes up when PRD-065 flips to "now" and the MTL semantic question becomes load-bearing.
- **I1 / I2** — test hygiene, run alongside any QA touch to the area.
- **J** — product direction; not containment.

---

## 5. Direction (one sentence)

**Next up: H1 as a direct commit (not a PRD), PRD-067 for H2+H3+H4, with the K audit (~1hr) before PRD-067 to feed ADR-049's watchlist.** PRD-065 and ADR-050 stay parallel-track, trigger-gated.

---

## 6. Governance / rule coverage after today

| Layer | Status |
|---|---|
| `no-temporal-bypass` ESLint rule scope | `services/`, `app/`, `hooks/`, **`components/`** (added `c8c6d301`) |
| Patterns caught | `toISOString().slice(0,10)`, UTC accessors, banned names, **`format(new Date(), '<date-only>')`** (added `c8c6d301`) |
| False-positive guard | Format patterns with time tokens (`H/h/m/s`) are allowed (wall-clock stamps) |
| Remaining gaps | None at the rule layer |

The MTL compliance-dashboard drift class is closed at the tooling layer — future temporal bypasses in any `components/` surface will fail lint.

---

## 7. Related documents

| File | Purpose |
|---|---|
| [`RATING-MTL-ISSUE.md`](./RATING-MTL-ISSUE.md) | Incident record, Phase-1 triage |
| [`7-findings.md`](./7-findings.md) | Phase-1 agent findings |
| [`PROPOSED-FIXES.md`](./PROPOSED-FIXES.md) | Initial proposal — audited by `hardening-direction-audit.md` |
| [`hardening-direction-audit.md`](./hardening-direction-audit.md) | Classifies P0.1–P0.3/P1.4 as containment, rest as adjacent — origin of this backlog |
| [`arch-flaw.md`](./arch-flaw.md) | Architectural reasoning behind ADR-049 |
| [`POST-IMPL-PRECIS.md`](./POST-IMPL-PRECIS.md) | What PRD-064 actually shipped |
| [`PRD-065-DEFERRAL-RATIONALLE.md`](./PRD-065-DEFERRAL-RATIONALLE.md) | Rationale for deferring ADR-049 packaging |
| [`DOWNSTREAM-CONSUMER-POSTURE.md`](./DOWNSTREAM-CONSUMER-POSTURE.md) | Read-plane investigation; origin of H2 + H3 scope |
| [`../../10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md`](../../10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md) | PRD-064 containment slice |
| [`../../80-adrs/ADR-049-operator-action-atomicity-boundary.md`](../../80-adrs/ADR-049-operator-action-atomicity-boundary.md) | ADR-049 composite-mutation boundary |
