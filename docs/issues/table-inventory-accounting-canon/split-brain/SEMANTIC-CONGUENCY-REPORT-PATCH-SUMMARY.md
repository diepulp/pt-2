All five patches applied. Here's the summary:

---

**PATCH-1 (P1 — CRACK-001)** — UL Baseline + Classification YAML
- Deleted `Estimated Win/Loss: $X ← acceptable alternative label` from §Surface rendering rules; replaced with explicit forbidden note citing ADR-060 D4
- Removed `"Estimated Win/Loss"` from the "only in-scope labels" closing sentence
- Removed `"Estimated Win/Loss"` from `projected_table_win_loss_cents` surface label statement
- Removed `Estimated Win/Loss` from `allowed_surface_labels` in Classification YAML; added `forbidden_note_estimated_win_loss`

**PATCH-2 (P1 — CRACK-002)** — ADR-059 D3
- Renamed `inventory:` → `snapshots:` in the TypeScript `source_authority` interface block
- Added `// KEY AMENDED: 'inventory' → 'snapshots' per ADR-060 D3.` inline comment
- Added blockquote header note before the DTO block declaring ADR-060 D3 as the governing definition

**PATCH-3 (P2 — CRACK-003)** — Classification YAML
- Changed `estimated_drop_cents.status: acceptable_with_label` → `deprecated_alias_transitional` with updated reason text citing ADR-060 D1/D4

**PATCH-4 (P2 — CRACK-004)** — UL Baseline + Classification YAML + Scaffold
- Added `RATED_ADJUSTMENT` row to canonical drop taxonomy table (status: Excluded; semantic decision, not structural)
- Appended RATED_ADJUSTMENT exclusion sentence to `open_question_L_telemetry_source.resolution`
- Added two `--` SQL comments in the Scaffold §4 telemetry predicate after the `kind IN` clause

**PATCH-5 (P2 — CRACK-005)** — UL Baseline
- Renamed `input_completeness` → `completeness.status` in the completeness envelope table
- Added `integrity_failure` as third allowed value with the required note
- Updated `missing_inputs` and `integrity_issues` rows to reference `completeness.status=partial`
- Fixed the Two-axis invariant sentence

---

**Residual note** — four spots in the Classification YAML still reference `"Estimated Win/Loss"` as an acceptable label (lines 324, 493, 932, 1066 — in `consequence_for_this_feature`, `label_rule`, RULE-7.6, and `split_brain_regression_requirements`). The formal patches only targeted `allowed_surface_labels`; those narrative sections are inherited inconsistencies that the patches didn't prescribe. They're consistent with the old ADR-053 consequence wording and will misguide a PRD reader — worth a follow-up sweep before the PRD is drafted, but not blocking by the patch spec as written.