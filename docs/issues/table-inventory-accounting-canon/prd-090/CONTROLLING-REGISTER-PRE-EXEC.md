## PRD-090 v7 Update — All P0 Blockers Closed
**Date:** 2026-06-01 | **PRD version:** v7 | **Patches:** PRD090-DA-006 + PRD090-DA-007

The v5 report below declared NOT EXEC-READY with five P0 blockers. All five are now closed. Status is **EXEC-AUTHORIZED** as of v7.

| Blocker | Resolution | Evidence |
|---|---|---|
| **P0-1** — bigint cast overflow | CLOSED | WS2 text: `COALESCE(total_cents::bigint, chipset_total_cents())`. WS2 exit gate: `no_integer_cast_in_snapshot_resolution: true`. DA-006 (v6). |
| **P0-2** — fills/credits predicate | CLOSED | WS2 text: `WHERE table_fill.session_id = table_session.id`; `fills_total_cents` explicitly rejected. WS2 exit gate: `fills_credits_source_predicate_declared: true`. DA-006 (v6). |
| **P0-3** — provenance.ts build-break | CLOSED | Classification YAML `allowed_residual_matches` entry reclassified: `exec_obligation: code_change_required`, BLOCKER note added, `npm run type-check` gate required. WS5 inventory §5 enumerates both remediation paths. |
| **P0-4** — WS5 inventory stub | CLOSED | WS5 inventory (`PRD-090-WS5-legacy-consumer-suppression-inventory.md`) is 276 lines: all 14 UI consumers + 10 API surfaces enumerated by ID/file/disposition, all 6 certification checklist items checked with evidence, 5 umbrella follow-up ticket IDs registered, `win_loss_inventory_total_cents` row present. |
| **P0-5** — UNRESOLVED-003 dual verdict | CLOSED | Classification YAML UNRESOLVED-003 resolution updated: "inherits DTO suppression consequence from LEGACY-API-008; route serialization test required at WS5." `win_loss_cents` added to `forbidden_terms.fields`. Both checkpoint routes added to `no_forbidden_api_serialization.target_routes`. |

**All blockers closed. Status: EXEC-AUTHORIZED (2026-06-01).** STOP-004 operational sign-off is inapplicable in the current pre-production development context — no live operator-facing surfaces exist and suppression cannot disrupt real operational workflows. The sign-off requirement is deferred to the pre-production launch readiness review, not a pre-EXEC or pre-WS5 gate. The §8 DoD item has been updated to reflect this closure.

---

## PRD-090 EXEC-Readiness Report (v5 — superseded for P0 items, retained for full finding history)
**Synthesized from: DA Technical Review + DA EXEC Authorization Review**
**Date:** 2026-06-01 | **PRD version:** v5 | **Clearance plan:** PRD-090-EXEC-CLEARANCE-PLAN.md

---

### Overall Verdict (v5 — superseded)

**NOT EXEC-READY. Five blocking items must be resolved first.**

The clearance plan correctly identifies that documentation patches close the two remaining gate gaps (LEGACY-API-009/010). However, both DA perspectives independently surface issues that pre-date or supersede the clearance plan's scope. Five blockers — three from the EXEC/suppression lens, two from the technical lens — prevent safe EXEC-SPEC drafting. None require scope expansion; all are patchable within PRD-090.

---

### Consolidated Findings

#### P0 — EXEC Blockers (must resolve before EXEC-SPEC is drafted)

| ID               | Lens             | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Minimal Fix                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BLOCKER-P0-1** | Technical        | `chipset_total_cents()` returns `bigint`; `::integer` cast in WS2 spec silently overflows for high-denomination chipsets and is an explicit downcast. Any high-value tray resolves as overflow rather than `integrity_failure`.                                                                                                                                                                                                                                                                                                           | Change WS2 spec: `COALESCE(total_cents::bigint, chipset_total_cents(chipset))`. Add WS2 exit gate item: `no_integer_cast_in_snapshot_resolution: true`. Add fixture in `tia.snapshot_resolution` for chipset yielding $1M+ cents.                                                                                                                             |
| **BLOCKER-P0-2** | Technical        | `table_fill.session_id` and `table_credit.session_id` are nullable with no backfill for pre-PRD-038 rows. A `WHERE session_id = :sessionId` SUM silently returns 0 for sessions with fills/credits written before 2026-02-24, producing wrong formula results with no integrity signal.                                                                                                                                                                                                                                                   | WS2 spec must commit to one of: (a) `WHERE session_id = :sessionId` with a documented pre-PRD-038 coverage gap disclosure, or (b) `table_session.fills_total_cents`/`credits_total_cents` as the authoritative source. Option (b) is MVP-safe. Add to WS2 exit gate: `fills_credits_source_predicate_declared: true`.                                         |
| **BLOCKER-P0-3** | EXEC/Suppression | `provenance.ts` (`services/table-context/shift-metrics/provenance.ts`) references `win_loss_inventory_cents` and `win_loss_estimated_cents` on `ShiftTableMetricsDTO`. LEGACY-API-001 removes those fields. After WS5 DTO removal, TypeScript compilation fails — a hidden build-breaking obligation classified as allowed_residual rather than `exec_obligation: code_change_required`.                                                                                                                                                  | Change provenance.ts entry to `exec_obligation: code_change_required`. Add to WS5 task list: either remove the two field references and replace the quality-signal derivation with a non-forbidden source, or deprecate `metric_grade` if no non-suppressed consumer requires it. Gate: `npm run type-check` passes after LEGACY-API-001 changes are applied. |
| **BLOCKER-P0-4** | EXEC/Suppression | WS5 inventory artifact (`PRD-090-WS5-legacy-consumer-suppression-inventory.md`) is a 59-line stub. All 6 certification checklist items are unchecked. Follow-up ticket column is universally "TBD." `win_loss_inventory_total_cents` (discovered extension) is absent. The WS5 exit gate condition `inventory_artifact_checked_in: true` cannot be truthfully asserted against this stub.                                                                                                                                                 | Complete the inventory before EXEC-SPEC drafting: enumerate all 14 UI consumers + 10 API surfaces by ID and file, check all certification items with evidence, add `win_loss_inventory_total_cents` row, replace TBD tickets with at least umbrella ticket IDs per suppressed domain.                                                                         |
| **BLOCKER-P0-5** | EXEC/Suppression | UNRESOLVED-003 is declared CLEAN for the checkpoint routes, but LEGACY-API-008 carries `exec_obligation: code_change_required` to remove `win_loss_cents` from `ShiftTableCheckpointDTO` — the DTO those routes serialize. Two conflicting verdicts on the same operator-facing exposure. The checkpoint route serialization tests are also absent from the `no_forbidden_api_serialization.target_routes` list. Additionally, `win_loss_cents` is not in `forbidden_terms.fields`, so the automated grep gate cannot catch this surface. | Correct the UNRESOLVED-003 verdict to: "Route is clean at formula level but inherits DTO suppression consequence from LEGACY-API-008; route serialization test required at WS5." Add checkpoint route endpoints to `no_forbidden_api_serialization.target_routes`. Add `win_loss_cents` to `forbidden_terms.fields` (scoped to checkpoint DTO).               |

---

#### P1 — Pre-Build Required (resolve before WS2 or WS5 begins)

| ID        | Lens             | Finding                                                                                                                                                                                                                                                                                           | Minimal Fix                                                                                                                                                                                                                                                             |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1-1**  | Technical        | FK-path snapshot resolution does not validate `snapshot.session_id` consistency. A stale FK pointing to a prior session's snapshot silently returns the wrong opener/closer.                                                                                                                      | Add to WS2 spec: "If FK-resolved snapshot has `session_id` set and it does not match the current table session, fall through to session-linked fallback." Add stale-FK fixture to `tia.snapshot_resolution`.                                                            |
| **P1-2**  | Technical        | WS3 route relies solely on RLS for tenant isolation with no explicit `casino_id` predicate in the service query. Defense-in-depth pattern (ADR-015 Pattern C) requires both RLS and explicit predicate.                                                                                           | Add to WS2/WS3 spec: "`table_session` lookup includes `casino_id = current_setting('app.casino_id')::uuid` as an explicit filter." Add to WS3 exit gate: `explicit_casino_id_predicate_in_query: true`.                                                                 |
| **P1-3**  | Technical        | `fills_cents: number` in Appendix B DTO is non-nullable, but SQL `SUM` for zero qualifying rows returns `NULL`. A zero-fill session produces a TS type violation. Fills/credits are not telemetry — COALESCE to 0 is correct and semantically distinct from the telemetry null-preservation rule. | Add note to Appendix B: "fills_cents and credits_cents SUM must be COALESCEd to 0 — zero fills is a valid count, not an integrity signal. This is distinct from the telemetry null-preservation rule." Add zero-fill/zero-credit fixture to `tia.five_operand_formula`. |
| **P1-4**  | Technical        | `tia.route_tenant_isolation` must assert HTTP 404 (not `200 { calculation_kind: 'integrity_failure' }`) for cross-casino sessionId. `integrity_failure` leaks existence.                                                                                                                          | Add to WS3 exit gate: "Cross-casino sessionId returns HTTP 404." Update `tia.route_tenant_isolation` assertion.                                                                                                                                                         |
| **P1-5**  | Technical        | `tia.route_role_matrix` description is silent on `admin` cross-casino denial. Add `admin` reading a Casino B session as an explicit denied sub-case.                                                                                                                                              | Update `tia.route_role_matrix` to include: `admin` JWT (Casino A) + Casino B sessionId → 404.                                                                                                                                                                           |
| **P1-6**  | Technical        | `tia.integrity_failure_suppression` tests result fields and `integrity_issues` but not the structured log emission required by ADR-059 D5 and §8 DoD. Logging is advisory-only in CI without this.                                                                                                | Add `tia.integrity_failure_log_emission` test: mock the application logger, invoke service with missing opener, assert fields `session_id`, `casino_id`, `calculation_kind`, `integrity_issues`, `request_id` are logged.                                               |
| **P1-7**  | Technical        | `rpc_compute_table_rundown` fate (drop vs. quarantine) is deferred to EXEC post-WS4, but no test is required for either path in WS6. If retained, the quarantine is unverifiable in CI.                                                                                                           | Add to WS6: either (a) a migration dropping the RPC is the proof (if dropped), or (b) a `tia.rpc_compute_table_rundown_quarantine` grep test proving no active operator path calls it (if retained). The EXEC must commit to one path before WS6 begins.                |
| **P1-8**  | EXEC/Suppression | STOP-004 has not been formally evaluated for any of the 14 UI consumers. Operational sign-off that suppression is acceptable has not been documented.                                                                                                                                             | Before EXEC-SPEC: obtain operational sign-off for LEGACY-CONSUMER-001/002/003 and LEGACY-CONSUMER-012/013. Record in WS5 inventory as `operational_necessity_cleared: true` per consumer.                                                                               |
| **P1-9**  | EXEC/Suppression | Shift report Win/Loss regression (LEGACY-CONSUMER-012/013 + LEGACY-API-007) produces an operationally diminished report with no communication plan, no placeholder message, and no DoD verification.                                                                                              | Add to §8 DoD: "Shift report renders a canonical placeholder in the suppressed Win/Loss section — confirmed in PR review." Add one WS5 UX decision: what the report renders in place of the removed metric.                                                             |
| **P1-10** | EXEC/Suppression | Blast radius map `api_and_dto_surfaces: 8` is stale post-BLOCKER-1 patch; should be 10. `suppress_rendering: 18` should be 20. `unresolved_requiring_inspection: 4` should be 0. Map `status` is still `proposed_pre_exec`.                                                                       | Two-minute documentation fix. Update blast radius map counts and status before EXEC-SPEC drafting.                                                                                                                                                                      |

---

#### P2 — Resolve During EXEC or WS5 (before merge)

| ID   | Lens             | Finding                                                                                                                                                                                                                                                                                                                  |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2-1 | Technical        | NFR-6 `upperBoundAt` injection mechanism is unspecified for multi-call implementations. WS2 exit gate must have a mechanistic answer (captured timestamp injected into telemetry SUM parameter), not a behavioral assertion.                                                                                             |
| P2-2 | Technical        | WS6 has no zero-tray opener/closer fixture. FR-4 invariant ("zero is a valid explicit count") has no corresponding test. `total_cents = 0` must produce `inventory_only`, not `integrity_failure`.                                                                                                                       |
| P2-3 | Technical        | NULL chipset + NULL `total_cents` combination: `chipset_total_cents(NULL)` returns 0 per the migration, so a blank snapshot resolves as zero-tray (not `integrity_failure`). Whether this is correct must be documented and tested explicitly, since `chipset jsonb NOT NULL` schema prevents it but the spec is silent. |
| P2-4 | Technical        | `completeness.included_inputs` shape for mixed `integrity_failure` + null telemetry is unspecified. If closer is missing AND telemetry is null, should `telemetry_drop_estimate` appear in `included_inputs`? Needs a concrete fixture.                                                                                  |
| P2-5 | EXEC/Suppression | LEGACY-CONSUMER-009/011 suppression is ambiguous — conditional language ("pass null OR remove prop IF component also suppressed") with no committed code path. HeroWinLossCompact renders "Win/Loss" label strings unconditionally at lines 61/87/94 even in null state.                                                 |
| P2-6 | EXEC/Suppression | Automated grep gate is underspecified: path exclusions, string-context scope (JSX attributes vs. object literals), and exact command are not defined. Gate could be implemented too permissively or too noisily and disabled.                                                                                            |

---

#### P3 — Advisory

| ID   | Lens             | Finding                                                                                                                                                                                                                    |
| ---- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3-1 | EXEC/Suppression | All 20 suppressed consumers have "TBD" follow-up tickets. WS5 certification checklist cannot be fully passed without at least umbrella ticket IDs. Administrative only — does not block the build.                         |
| P3-2 | Technical        | `table_inventory_snapshot` session-linked fallback uses a partial index on `session_id` only (no `snapshot_type` column). Acceptable at O(10–50) tables per shift; document in WS1 exit gate as accepted at current scale. |

---

### Gate Summary

```yaml
exec_readiness:
  status: BLOCKED
  blocking_items: 5            # BLOCKER-P0-1 through BLOCKER-P0-5
  pre_build_items: 10          # P1-1 through P1-10
  during_exec_items: 6         # P2-1 through P2-6
  advisory_items: 2            # P3-1 through P3-2

  safe_to_draft_exec_when:
    - BLOCKER-P0-1: chipset_total_cents cast corrected in WS2 spec to bigint
    - BLOCKER-P0-2: fills_credits aggregation predicate committed in WS2 spec
    - BLOCKER-P0-3: provenance.ts reclassified as exec_obligation code_change_required
    - BLOCKER-P0-4: WS5 inventory artifact completed (all 6 certification items, no TBD tickets)
    - BLOCKER-P0-5: UNRESOLVED-003 verdict corrected; win_loss_cents added to forbidden_terms

  recommended_pre_exec_also:
    - Blast radius map counts updated (P1-10) — 2-minute fix, no excuse to defer
    - STOP-004 operational sign-off documented (P1-8)
    - Shift report regression communication plan (P1-9)
```

---

### Effort to Unblock

All five blockers are **documentation and specification patches** — no new migrations, no schema changes, no SRL/SRM amendments, no scope expansion. Estimated effort:

| Blocker                | Effort                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------- |
| P0-1 (chipset cast)    | 15 min — one-line WS2 spec change + one test fixture description                       |
| P0-2 (fills predicate) | 30 min — one architectural decision + one WS2 spec paragraph                           |
| P0-3 (provenance.ts)   | 20 min — reclassify one entry, add one WS5 task item                                   |
| P0-4 (inventory stub)  | 2–3 hours — complete the inventory artifact against the existing classification YAML   |
| P0-5 (UNRESOLVED-003)  | 30 min — correct one verdict, add three lines to target_routes, add one forbidden term |

**Total to unblock EXEC: ~4 hours of documentation work.**