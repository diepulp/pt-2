I've now read the pilot containment protocol and all Wedge C direction documents. Here's the audit.

---

## Pilot Containment Audit — Wedge C Direction

**Audit date:** 2026-03-23
**Protocol:** `docs/60-release/pilot_containment_protocol.md`
**Method:** Seven-Question Filter + scope bucket classification applied to every deliverable and doc reference

---

### FINDING 1 — CRITICAL GOVERNANCE GAP: Canonical pilot loop is blank

**Where:** `pilot_containment_protocol.md` lines 121-128

The protocol's entire enforcement mechanism depends on a frozen canonical pilot loop. The template is empty — no screens, no actions, no user journey filled in. Every scope admission test ("What exact pilot scenario fails without this?") is untethered because there is no loop to test against.

This is how Slack got in. This is how everything below got in. Without a frozen loop, scope claims have no falsification surface.

**Protocol violation:** Week 1 deliverable "Canonical pilot loop" — not completed. Freeze Rule (line 132-134) has no subject.

**Recommendation:** Fill in the canonical pilot loop before executing C-2. Until it's frozen, every scope decision is a judgment call with no anchor.

---

### FINDING 2 — pg_cron scheduler is Stabilize Later, not Ship Now

**Where:** Intake doc Track B1, Rollout dep map line 7

Seven-Question Filter:
1. What exact pilot scenario fails without this? Admin forgets to click "Recompute Baselines."
2. Who fails? Pit boss sees stale baselines.
3. Can they still complete the task without it? **Yes** — admin clicks button each morning.
4. Is there a manual workaround for 4 weeks? **Yes** — button exists (PRD-055 ships it).
5. Does this add a new axis of variability? **Yes** — pg_cron extension dependency, service_role caller context, schedule configuration.
6. Does this touch more than one bounded context? Weakly — invokes ShiftIntelligenceService RPC from system context.
7. If I defer this, does pilot actually die? **No.**

Decision per protocol: **Defer.** Manual workaround exists. New axis of variability. Pilot doesn't die.

The intake doc also notes a fallback: "provide fallback via Edge Function cron if not" — that's two implementation paths for one non-critical feature. Classic scope multiplier.

**Protocol bucket:** Stabilize Later
**Recommendation:** Remove B1 from C-2/C-3 intake. Add to Deferred Ledger. Admin clicks button each morning for 4 weeks.

---

### FINDING 3 — Cash obs baseline cutover is Ban Until After Pilot

**Where:** Intake doc Track B2

Seven-Question Filter:
1. What exact pilot scenario fails without this? Nothing — cash obs alerts work today via static thresholds.
2. Who fails? Nobody. `rpc_shift_cash_obs_alerts` is functional and authoritative (PRD-055 §4.1 explicitly preserves it).
3. Can they complete without it? **Yes** — this is the status quo.
4. Manual workaround? **Not needed** — existing system is already the production path.
5. Does this add a new axis of variability? **Yes** — introduces `use_baseline` config flag, new code path, new behavioral mode.
7. Does pilot die? **No.**

This is "future-proofing disguised as safety" (protocol line 98). PRD-055 already correctly keeps cash obs authority with static thresholds and stores baselines for *validation only*. The cutover flag creates a new configuration dimension for something that works fine today.

**Protocol bucket:** Ban Until After Pilot
**Recommendation:** Remove B2 from intake. Cash obs cutover happens in a future phase after baseline-aware alerting for drop/hold is proven in production.

---

### FINDING 4 — Stale Slack/email references in PRD-055, RFC-004, SCAFFOLD-004

**Where:**
- PRD-055 line 49: `"External notifications — Slack, email, webhook (Phase C-3)"`
- PRD-055 line 146: `"Slack / email / webhook notifications (Phase C-3)"`
- RFC-004 line 50: `"External notifications (Phase C-3)"`
- SCAFFOLD-004 line 37: `"External notifications (Slack, email, webhook) — alerts visible only on admin dashboard. Notification routing is Phase C-3 scope."`

These non-goal references still say notifications are "Phase C-3 scope," which is the old framing. The hardening report and intake doc now correctly say notifications are a **separate post-C3 effort** with their own slicing. The stale references create an expectation that notifications are part of the Wedge C completion claim.

**Recommendation:** Update non-goal language in all four docs to say "External notifications — separate post-C3 effort, not part of Wedge C completion claim (see Hardening Report §III Pilot Containment Rule)."

---

### FINDING 5 — RFC-004 AnomalyAlertDTO still lists 5 readiness states

**Where:** RFC-004 line 152

```typescript
readinessState: 'ready' | 'stale' | 'missing' | 'insufficient_data' | 'compute_failed'
```

PRD-055 v0.4.0 explicitly deferred `compute_failed` to Phase C-2. The RFC was written before that amendment and still shows 5 states. Any implementer reading the RFC will build 5 states, contradicting the PRD.

**Recommendation:** Update RFC-004 DTO to show 4-state model matching PRD-055 v0.4.0, with a comment noting `compute_failed` is Phase C-2.

---

### FINDING 6 — Rollout dep map is entirely stale

**Where:** `WEDGE-C/ROLLOUT-DEP-MAP.md`

This document still has:
- Line 10: "Slack/email notifications — Yes — reads from `shift_alerts` to decide what to send"
- Line 16: "Sequential: Slack/email notifications — wires after `shift_alerts` lands"
- Line 18: "One PR, one branch, ~3 weeks compressed to ~2"

The dep map was the working notes that produced the intake doc. It hasn't been updated to reflect the Slack removal, the Track C deletion, or the timeline change. Anyone reading it gets the pre-audit plan.

**Recommendation:** Either delete this file (working notes, superseded by intake doc) or update it to reflect the corrected scope.

---

### FINDING 7 — Hardening Report Phase 2/3 bundles cross-wedge items

**Where:** Hardening report lines 317-335

Phase 2 includes:
- 2.4: Loyalty reversal RPC — **Wedge D item**, not Wedge C

Phase 3 includes:
- 3.3: Loyalty snapshot automation — **Wedge D**
- 3.4: Liability snapshot read endpoint — **Wedge D**
- 3.5: Exclusion safety signal wiring — **Wedge D**
- 3.6: Slip Detail audit trace panel — **Wedge A/B**

These are bundled under "Operational Polish" alongside the Wedge C completion gate. The gate itself is correctly scoped ("Wedge C → GREEN when 3.1-3.2 pass"), but the surrounding items create a scope bundle that makes the phase *look* larger than the Wedge C work actually is. This is how cross-wedge items get pulled into the active execution stream — they're co-located with the critical-path items and become de facto commitments.

**Protocol rule violated:** "No parallel initiatives — one active pilot stream at a time" (line 306-307).

**Recommendation:** Move items 2.4, 3.3-3.6 into a separate "Cross-Wedge Polish (Post Wedge C GREEN)" section. Keep the phase gates clean — Phase 2 and 3 should contain only Wedge C items.

---

### FINDING 8 — Deferred/Ban Ledger is empty

**Where:** `pilot_containment_protocol.md` lines 421-431

The protocol explicitly warns: *"If it is not written as excluded, your future self will try to sneak it back in"* (line 187). The Deferred and Banned ledgers are blank. Deferred items are scattered across non-goals in 6+ separate documents with inconsistent language.

This is how the Slack decision propagated — it wasn't written down in one place as excluded, so it appeared as a deliverable in the intake doc, the dep map, the hardening report roadmap, and the non-goals sections simultaneously.

**Recommendation:** Populate the Deferred/Ban Ledger in the protocol with at minimum:
- **Banned:** Slack integration, email notifications, pg_cron scheduler, cash obs baseline cutover, ML anomaly detection, cross-property baselines
- **Deferred:** Notification foundation (post-C3), loyalty reversal RPC, snapshot automation, exclusion safety signal, `compute_failed` readiness state

---

### FINDING 9 — SCAFFOLD-004 still lists `promo_issuance_total` as input metric

**Where:** SCAFFOLD-004 line 48

```
Metric type(s): drop_total, hold_percent, cash_obs_total, promo_issuance_total
```

PRD-055 replaced `promo_issuance_total` with `win_loss_cents` because the source RPC doesn't exist (Appendix A, metric type evolution note). The scaffold still lists the old metric name. Minor, but someone reading scaffolds-first (which is the intended pipeline order) will get confused.

**Recommendation:** Update SCAFFOLD-004 to list `win_loss_cents` with a note that `promo_issuance_total` was deferred.

---

### Summary Table

| # | Finding | Severity | Protocol Violation | Action |
|---|---------|----------|-------------------|--------|
| 1 | Canonical pilot loop blank | **P0** | Core Rule has no subject | Fill in and freeze before C-2 execution |
| 2 | pg_cron scheduler in scope | **P1** | "Manual workaround exists → Defer" | Remove from intake, add to Deferred Ledger |
| 3 | Cash obs baseline cutover in scope | **P1** | "New axis of variability → Ban" | Remove from intake, add to Banned Ledger |
| 4 | Stale Slack/notification references (4 docs) | **P2** | Propagates old framing | Update non-goals language |
| 5 | RFC-004 5-state DTO vs PRD 4-state | **P2** | Doc inconsistency | Update RFC-004 |
| 6 | Rollout dep map entirely stale | **P2** | Superseded working notes | Delete or update |
| 7 | Cross-wedge items bundled in Wedge C phases | **P1** | "No parallel initiatives" | Move to separate post-GREEN section |
| 8 | Deferred/Ban Ledger empty | **P1** | Protocol §C explicit warning | Populate with all known deferrals |
| 9 | SCAFFOLD-004 stale metric name | **P3** | Doc inconsistency | Update to `win_loss_cents` |

---

Want me to execute the fixes, or do you want to review and triage first?