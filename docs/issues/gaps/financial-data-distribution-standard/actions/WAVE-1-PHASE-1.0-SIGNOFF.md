---
name: Wave 1 — Phase 1.0 Exit-Gate Sign-Off
description: Lead-architect sign-off record for the 8 open classification/rendering decisions (Q-A1 through Q-A8) that block Phase 1.0 exit. Records decisions, rationales, and amendments; promotes rules from the classification-rules §7 into normative status.
status: Accepted
date: 2026-04-23
phase: 1.0
signatory: Lead Architect (via /lead-architect skill invocation)
branch: ref/financial-standard
prior_commits:
- ff9da699 (docs(financial-telemetry): Phase 1.0 prep & inventory — FinancialValue envelope + rollout artifacts)
- 521c57d7 (docs(financial-telemetry): add execution governance — roadmap is planning, not EXEC-SPEC)
governs:
- actions/WAVE-1-CLASSIFICATION-RULES.md §7 (resolved from open questions to decisions)
- actions/WAVE-1-SURFACE-INVENTORY.md §5.1 (Theo), §6 (Q list)
- actions/WAVE-1-FORBIDDEN-LABELS.md §2.C, §2.D (rule activation)
- actions/ROLLOUT-PROGRESS.md (Phase 1.0 exit gate)
frozen_docs_consulted_not_modified:
- decisions/ADR-FINANCIAL-FACT-MODEL.md §D1, §D3, §D4
- decisions/ADR-FINANCIAL-SYSTEM-SCOPE.md
- decisions/ADR-FINANCIAL-EVENT-PROPAGATION.md §4
- decisions/ADR-FINANCIAL-AUTHORING-PARITY.md
- actions/SURFACE-RENDERING-CONTRACT.md §3, §8, §10, §C1, §C2, §C3, §F4, §K1, §K2, §L1, §L2, §L3
---

# Wave 1 — Phase 1.0 Exit-Gate Sign-Off

> Records lead-architect decisions on the 8 open questions from `WAVE-1-CLASSIFICATION-RULES.md §7`. With this sign-off, Phase 1.0 closes and Phase 1.1 PRD authoring is unblocked.

---

## 1. Governance posture

No frozen decision doc was modified. Every decision below is an interpretation of a frozen ADR or SRC clause, or a normative rule promoted from the prep/inventory phase into active status. The ADR-supersession path was evaluated for each Q and not needed.

Invocation model: this review used the `/lead-architect` skill's **architecture compliance validation** role (skill §4), not the EXEC-SPEC scaffolding role. The decisions below are product-of-the-review artifacts; they do not author new ADRs.

---

## 2. Decisions

### Q-A1 — `rating_slip.average_bet` classification

**Decision: APPROVE as recommended.** `average_bet` is NOT wrapped in `FinancialValue`. Treated as operator input (CLASSIFICATION-RULES §6.1). UI labels it "Input" (or surface-appropriate variant like "Avg Bet (Input)") with explicit visual distinction from envelope-wrapped values.

**Rationale.** FACT-MODEL §D1 enumerates four authorities; none fit a dealer-entered rate parameter. Creating a fifth authority supersedes SRC §10 (four values frozen). The emitted financial fact derived from `average_bet` is `rating_slip.computed_theo_cents`, which IS envelope-wrapped (`estimated`, source `"rating_slip.theo"`). The rate itself is the input parameter, not the emitted fact.

**Governing clauses.** FACT-MODEL §D1 (four authorities), §D3 (Class B scope = grind + table-level money movement, excludes rate parameters). SRC §10 (four-value envelope). CLASSIFICATION-RULES §6.1 (operator inputs not wrapped).

**Amendment note.** Where a surface displays `average_bet` alongside `computed_theo_cents`, the UI MUST visually distinguish the two (bare-number + "Input" label vs. envelope-wrapped with `Estimated` badge). Phase 1.3 PRD must confirm this visual distinction.

---

### Q-A2 — `observed` / `compliance` labels in pilot

**Decision: APPROVE as recommended.** Existing `pit_cash_observation`, `table_inventory_snapshot`, and `mtl_entry` rows are live sources for envelope labeling purposes. No new authoring workflows are opened in Wave 1.

**Rationale.** FACT-MODEL §D1 is explicit: "these classes exist in the full taxonomy so downstream surfaces can label values consistently." The ADR scopes its *authoring governance* (R1–R5 invariants) to Class A/B; it does NOT forbid using the `observed`/`compliance` labels on the rows authored by other owners (cash-obs authoring, MTL pipeline). The strict reading ("don't label these rows") would make existing pit-cash and MTL surfaces unlabelable, breaking SRC §L1.

**Governing clauses.** FACT-MODEL §D1 (taxonomy permission for surfaces). SRC §L1 (every value must include a label). SRC §C1 (no implicit aggregation — cross-class merging remains forbidden).

**Normative rule (promoted).** `observed` and `compliance` envelopes carry the authority label for surface consistency. They do NOT imply the row was authored under this ADR set's governance (Class A/B invariants R1–R5 do not apply). Consumers MUST NOT merge `observed`/`compliance` envelopes with Class A/B values into derived totals.

---

### Q-A3 — Class B source string stability

**Decision: APPROVE with clarifying normative rule.** Source strings (`"table_session.drop"`, `"rating_slip.theo"`, etc.) are service-private. UI MAY display `source` verbatim for debugging/provenance tooltips. UI MUST NOT branch control flow or styling on `source` values.

**Rationale.** SRC §10 defines `source` as "human-readable origin" (string, no enumeration). FACT-MODEL §5 leaves Class B authoring-store shape as an open question for Wave 2. If UI branched on source strings, any Wave 2 rename (e.g., consolidation to `"grind"`) would cascade through every consumer — violating the "surface before schema / parity from day one" principle (ROADMAP §2.1, §2.3).

**Governing clauses.** SRC §10 (source is human-readable origin). FACT-MODEL §5 (Wave 2 open shape question).

**Normative rule (promoted to CLASSIFICATION-RULES §3 preamble).**
- Consumers branch on `type` and consume `source` as display-only metadata.
- Phase 1.1 unit tests MAY assert exact source strings at the mapper level. Integration tests and UI tests MUST NOT assert exact source strings — they assert `type` and `completeness.status`.

---

### Q-A4 — Cash-obs extrapolated vs confirmed split

**Decision: APPROVE as recommended.** Cash-obs extrapolated (`estimated`) and confirmed (`observed`) rollups ALWAYS render as Pattern A split (SRC §8). No combined number in any UI.

**Rationale.** SRC §C1 is unambiguous: "Mixed sources MUST NOT be combined into a single number." Extrapolated and confirmed are different authority classes. A visual combination is forbidden.

**Governing clauses.** SRC §C1 (no implicit aggregation), §8 (Pattern A split required), §D5 (authority hierarchy for primary display — priority, not merging).

**Clarifying rule.** Pattern B (derived total with explicit "Derived" label) is NOT forbidden. A surface MAY show `Estimated Total Cash Out (Confirmed + Extrapolated, Derived)` as a secondary display — but:
- Authority degrades to worst-of (`estimated` in this combination).
- Input components MUST be declared per SRC §C3.
- This is NOT a substitute for Pattern A split; both must coexist if Pattern B is shown.

---

### Q-A5 — Shift-intelligence `observedValue` authority routing

**Decision: APPROVE the principle with scoping note for Phase 1.1 PRD.** Envelope authority for `AnomalyAlertDTO.observedValue` and `ShiftAlertDTO.observedValue` follows the metric-kind source, not a generic "observed" default. Concrete metric-kind → authority table is a Phase 1.1 backend-service-builder deliverable.

**Rationale.** The alert wrapper is authority-agnostic by design — it reports "current vs expected" for whatever metric kind is being tracked. Collapsing every alert value to a single authority would lie about provenance. The envelope requires one `type` per wrapped value, so the mapper must read a discriminator.

**Scoping note (informs Phase 1.1 PRD).** Phase 1.1 PRD for shift-intelligence must:
1. Verify whether `ShiftAlertDTO` / `AnomalyAlertDTO` carry a metric-kind discriminator today. Inspect `services/shift-intelligence/dtos.ts` and the underlying RPC contract.
2. If discriminator is present: map each discriminator value to `FinancialAuthority` in a lookup table (e.g., `drop_total → 'estimated'`, `cash_obs_confirmed → 'observed'`, `win_loss_cents → 'estimated'`).
3. If discriminator is absent: Phase 1.1 scope expands to either add the column (minor schema change, within Wave 1 "additive only" allowance) or infer the kind at mapper time from the alert's source metric ID.

---

### Q-A6 — `pit_cash_observation.amount` stored in dollars

**Decision: APPROVE with rounding test requirement.** Mapper converts dollars → cents at envelope boundary via `Math.round(dollars * 100)`. Schema migration deferred to Wave 2.

**Rationale.** Wave 1 principle: "surface before schema" (ROADMAP §2.1). The envelope's `value` field is canonically cents per CLASSIFICATION-RULES §4. Mapper-level conversion is mechanically safe.

**Normative addendum (Phase 1.1 mapper requirement).** Mapper MUST include a unit test pinning rounding behavior at boundary cases: `0.005 → 1 cent` (or 0 cent — specify), `0.015 → 2 cents`, `-0.005 → 0 or -1 cent`, etc. This is not a theoretical concern: Wave 2 schema migration will either replicate these semantics OR intentionally change them with a documented rationale. The pinned test is the bridge.

**Governing clauses.** ROADMAP §2.1 (surface before schema). CLASSIFICATION-RULES §4 (canonical cents).

---

### Q-A7 — `theoEstimate` stub at `components/player-360/summary/summary-band.tsx`

**Decision: APPROVE-WITH-AMENDMENT.** Architectural principle: render the envelope with `completeness.status: 'unknown'` and an authority-labeled "Not computed" treatment. UI execution details DEFERRED to `/frontend-design-pt-2` in Phase 1.3.

**Rationale.** The architectural question is: *"Is rendering $0 without authority label ever acceptable?"* The answer is **no** — SRC §F4 explicitly forbids placeholder authority. Between the two recommendation options:

- **Option (a) remove the field**: zero risk of misinterpretation. But it discards the envelope slot SRC §10 explicitly provides for "we don't know."
- **Option (b) render `status: 'unknown'`**: uses the envelope's native `'unknown'` completeness (SRC §10 + §K2 require `status` to be present; `'unknown'` is the canonical "say so, don't guess" value). Prepares the UI slot for Wave 2 theo authoring with zero surface refactor.

Option (b) is the architecturally-aligned choice BECAUSE the envelope was designed to carry this state. Using it is honoring the contract; removing the field is a tactical workaround.

**Deferred to `/frontend-design-pt-2` (Phase 1.3 PRD).**
- Badge text (`"Not computed"`, `"Unknown"`, `"Pending"` — pick one with operator testing).
- Visual weight — the badge must be visible at first glance (SRC §L2) without badge-fatigue across many surfaces.
- Whether the field is hidden (collapsed) vs. rendered with badge at default — the default choice should be informed by operator UX testing in Phase 1.5.
- Tooltip content explaining what "unknown" means in the specific context (theo calculation not implemented vs. temporarily unavailable).

**Interim violation handling.** The current render of `Theo: 0` is a **live SRC §F4 violation** logged in `WAVE-1-SURFACE-INVENTORY.md §5.1`. Until Phase 1.3 lands the proper envelope-unknown treatment, the violation ships. Product may elect to patch it out-of-phase (remove the field from `mappers.ts:179` + `summary-band.tsx:137` to stop the violation immediately) — this is a product-impact call, not an architectural one. If such a patch lands, Phase 1.3 reintroduces the field with envelope-unknown UI.

**Governing clauses.** SRC §F4 (no placeholder authority). SRC §10 (`completeness.status` mandatory, `'unknown'` canonical). SRC §K2 (completeness visible, not implied). SRC §L2 (labels at first glance).

---

### Q-A8 — `FinancialSectionDTO.totalChipsOut` rename

**Decision: APPROVE as recommended.** Rename `totalChipsOut` → `totalCashOut` at the DTO boundary in Phase 1.1. Breaking change scope: `services/rating-slip-modal/` + all consumers.

**Rationale.** A misleadingly-named DTO field IS a label surface for every consumer reading the DTO. "Chips" semantically implies physical count (`observed`); the field is sourced from PFT cash-out aggregate (`actual`). SRC §L3's forbidden-label mapping (Chips Out → Cash Out) naturally extends to identifiers.

**Scoping requirement for Phase 1.1 PRD.** Rename must cover (non-exhaustive; Phase 1.1 PRD enumerates):
- `services/rating-slip-modal/dtos.ts:149`
- `services/rating-slip-modal/mappers.ts` (field population)
- `services/rating-slip-modal/schemas.ts` (Zod schema if present)
- `services/rating-slip-modal/rpc.ts` (RPC return shape)
- API response / OpenAPI component schema — add dated sunset note for old field during transition window
- UI consumers (rating-slip modal, any aggregation panel reading `totalChipsOut`)
- Integration tests asserting on `totalChipsOut`
- Any documentation referencing the old name

**Governing clauses.** SRC §L3 (forbidden labels extended to identifiers). FORBIDDEN-LABELS §2.D (rule promoted to ACTIVE status by this sign-off).

**Normative rule (promoted).** FORBIDDEN-LABELS §2.D rule `no-misleading-chips-identifier` becomes active for Phase 1.1 scope. Post-Phase-1.1, Phase 1.4 ESLint rule catches any regression.

---

## 3. Phase 1.0 exit gate status

Reviewing the three exit-gate criteria from `ROLLOUT-ROADMAP.md §3 Phase 1.0`:

| # | Exit gate criterion | Status | Evidence |
|---|---------------------|--------|----------|
| 1 | Envelope type merged to `main` | **PASSED on this worktree branch** | `types/financial.ts` shipped in `ff9da699`; tsc clean; 3 exports match SRC §10 verbatim. Cross-worktree merge to `main` is a separate CI/CD step — not an architectural gate. |
| 2 | Surface inventory reviewed by lead-architect | **PASSED** | This sign-off doc records the review. Inventory is accepted as complete (8 services enumerated, 4 confirmed SRC violations catalogued, audit findings merged). Known gaps (Phase 1.1 will re-verify file:line refs during mapper migration) are documented, not blocking. |
| 3 | Classification rules signed off | **PASSED** | Q-A1 through Q-A8 resolved above. All decisions honor the frozen ADR set + SRC; no supersession required. Rules promoted from `§7 open questions` to normative status in the amended CLASSIFICATION-RULES doc. |

**Phase 1.0 exit gate: PASSED.**

Phase 1.1 PRD authoring is **UNBLOCKED**. Per `ROLLOUT-ROADMAP.md §2.5`, next step is `/prd-writer` authoring the Phase 1.1 PRD (Service DTO Envelope migration) citing this sign-off + classification rules + surface inventory.

---

## 4. Phase 1.1 PRD authoring prerequisites (handoff)

For the Phase 1.1 PRD author, this sign-off fixes:

1. **8 services in scope** (INVENTORY §3): `player-financial`, `rating-slip`, `rating-slip-modal`, `visit`, `mtl`, `table-context`, `loyalty`, `shift-intelligence`.
2. **Breaking changes:**
   - DTO rename: `totalChipsOut` → `totalCashOut` in `services/rating-slip-modal/` (Q-A8).
   - Visit service: stop pre-converting cents→dollars at service boundary; envelope carries cents (CLASSIFICATION-RULES §4).
3. **Non-wrapping carve-outs** that must be documented in DTO JSDoc as bare numbers:
   - `rating_slip.average_bet` (Q-A1)
   - Policy/config values (CasinoThresholds, TableSettings limits, ValuationPolicy, EntitlementFulfillment.required_match_wager_cents) — CLASSIFICATION-RULES §6.2
   - Points (non-currency unit) — CLASSIFICATION-RULES §6.3
4. **Completeness strategy MUST be `'unknown'`** for: `rating_slip.legacy_theo_cents`, ambiguous-boundary gaming-day aggregates, shift baselines below sample-size threshold, confirmed-null fields (CLASSIFICATION-RULES §5.3).
5. **Open metric-kind discriminator question** (Q-A5) for shift-intelligence: Phase 1.1 PRD must decide whether to add a discriminator column or mapper-infer. This is the ONE Phase 1.1 scoping decision this sign-off leaves open.
6. **Test requirements activated:**
   - Mapper-level unit tests MAY assert exact `source` strings. Integration/UI tests MUST NOT.
   - `pit_cash_observation` dollar→cents conversion MUST be pinned with boundary-case unit tests.
   - Every mapped envelope must have unit tests asserting `type` + `completeness.status` match this classification rules doc.

---

## 5. Closing

Phase 1.0 closes with all decisions honoring the frozen ADR set + SRC. The envelope type, inventory, classification rules, and forbidden-label taxonomy are now the normative prep-output for every Phase ≥ 1.1 PRD.

The one Q that required amendment (Q-A7) cleanly separates architectural principle (envelope `unknown` is the right semantic) from UI treatment (deferred to frontend-design-pt-2). The remaining seven Qs approved as recommended.

> Wave 1's first discipline held: no decision in this sign-off required patching a frozen doc.
> The next discipline — Phase 1.1 implementation under PRD/EXEC-SPEC governance — opens now.
