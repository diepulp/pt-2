---
name: Wave 1 — Forbidden Labels (Grep-Ready)
description: Denylist, replace-with mapping, and allowlist for currency-related labels in PT-2. Feeds the Phase 1.4 ESLint rules no-forbidden-financial-label and no-unlabeled-financial-value.
status: Draft (pending lead-architect sign-off at Phase 1.0 exit gate)
date: 2026-04-23
phase: 1.0
derives_from:
- actions/SURFACE-RENDERING-CONTRACT.md §L3, §F1, §F2, §F3, §F4, §K1
- actions/WAVE-1-SURFACE-INVENTORY.md §5.1 (confirmed live violations)
- ../SURFACE-CLASSIFICATION-AUDIT.md (Hot Findings, all streams)
feeds:
- Phase 1.4 ESLint custom rules
- Phase 1.4 Playwright DOM assertions
---

# Wave 1 — Forbidden Labels (Grep-Ready)

> **Purpose:** give the Phase 1.4 ESLint rule author a concrete denylist, replace-with mapping, and allowlist. Every entry below is either grep-anchored (exact string match) or regex-anchored (explicit pattern). No semantics-only rules — everything in this doc is mechanically detectable.

---

## 1. Scope

- **Target file globs:** `components/**/*.{ts,tsx}`, `app/**/*.{ts,tsx}` (UI surfaces). Test files `**/*.test.{ts,tsx}` and `**/*.spec.{ts,tsx}` are excluded.
- **Target file globs for DTO-level rules:** `services/**/dtos.ts` (field-name lint — see §2.D).
- Markdown, ADRs, and PRDs are exempt (they discuss forbidden labels in examples).

---

## 2. DENY — strings/patterns that must not appear

Every rule here cites the SRC clause that forbids it. Phase 1.4 generates one ESLint rule per section; per-rule error messages cite the SRC clause.

### 2.A — Forbidden aggregate labels (SRC §L3, §F1, §F3)

These are ambiguous totals. They imply a merged authority that the frozen model rejects.

| Pattern | Matches | SRC clause |
|---------|---------|------------|
| `/\bTotal In\b/` | Exact string `"Total In"` as a word boundary match | §L3, §F1 |
| `/\bTotal Out\b/` | `"Total Out"` | §L3, §F1 |
| `/\bTotal Drop\b/` | `"Total Drop"` | §L3, §F3 |
| `/\bHandle\b(?!\s*\(\s*Estimated\s*Drop\s*\))/` | `"Handle"` **unless** immediately followed by `"(Estimated Drop)"` which is an explicit rename transition label | §L3, §F3 |

**Allowed compound that neutralizes the rule:** `"Estimated Total In"` when followed by `"(Derived)"` or a parenthetical input declaration per SRC §C2. Regex must anchor the prefix — see §4.1.

**Live violation today (must fix in Phase 1.3):** `components/pit-panels/analytics-panel.tsx:169` — `label: 'Handle'`.

### 2.B — Misleading authority labels (SRC §L3)

Strings that suggest a specific authority but originate from a different class.

| Pattern | Matches | SRC clause | Replace with |
|---------|---------|------------|--------------|
| `/\bChips Out\b/` | `"Chips Out"` | §L3 | `"Cash Out"` |
| `/\bChips In\b/` | `"Chips In"` (analog for inbound) | §L3 | `"Cash In"` |
| `/\bWin\b(?![\s\-]*(Inventory|Estimated|Table|Pit|Actual))/` | `"Win"` as a standalone label, NOT preceded/followed by a qualifier like `"Inventory Win"`, `"Estimated Win"`, `"Table Win"`, `"Pit Win"`, `"Actual Win"` | §L3 | `"Inventory Win"` / `"Estimated Win"` / `"Table Win"` per context |

**Edge case note on `"Win"`:** the regex must not flag legitimate compound labels. See §4.2 for the full pattern spec.

### 2.C — Placeholder authority (SRC §F4)

Zero-valued or empty-valued currency displays that masquerade as authoritative.

| Pattern | Matches | SRC clause |
|---------|---------|------------|
| `/Theo\s*:\s*0\b/` | `"Theo: 0"`, `"Theo:0"`, with or without spacing | §F4 |
| `/Theo\s*:\s*\$0(\.00)?\b/` | `"Theo: $0"`, `"Theo: $0.00"` | §F4 |

**Live violation today:** audit Stream B Hot Finding #1 — `theoEstimate` hardcoded to `0` and rendered in `components/player-360/summary/summary-band.tsx`. Phase 1.3 fix is either removal or explicit `status: 'unknown'` with "Not computed" badge (see CLASSIFICATION-RULES §7 Q-A7).

### 2.D — Misleading DTO field names (service-level)

Unlike §2.A–C which target `.tsx`, this rule targets `services/**/dtos.ts`.

| Pattern | Matches | Rationale | Replace with |
|---------|---------|-----------|--------------|
| `/\btotalChipsOut\b/` | Identifier `totalChipsOut` in a DTO | Name implies `observed` (chips = physical count); source is PFT (`actual`) | `totalCashOut` |
| `/\btotalChipsIn\b/` | Analog | Same reasoning | `totalCashIn` |

**Live violation today:** `services/rating-slip-modal/dtos.ts:149`. Phase 1.1 rename (CLASSIFICATION-RULES §7 Q-A8).

### 2.E — Coverage-as-completeness confusion (SRC §K1, §K2)

| Pattern | Matches | SRC clause | Replace with |
|---------|---------|------------|--------------|
| `/\bCoverage\s+quality\b/i` | `"Coverage quality"` (case-insensitive) | §K1 | `"Attribution Ratio"` |
| `/\bCoverage\b/` in the context of a KPI display component | `"Coverage"` as a standalone KPI label | §K1 | `"Attribution Ratio"` |

**Live violation today:** `app/(landing)/floor-oversight/page.tsx` — `"Coverage quality"` label. Phase 1.3 rename (INVENTORY §5.1).

**Context-sensitive note on `"Coverage"`:** the word may legitimately appear in unrelated contexts (test coverage, insurance coverage in hypothetical future features). The rule anchors to KPI-display contexts via file-path heuristics — see §4.3.

---

## 3. REPLACE-WITH mapping (quick reference)

Source: SRC §L3 authority-vocabulary table + audit-confirmed renames.

| Forbidden | Replace with | Applies to |
|-----------|--------------|------------|
| `Total` (unqualified) | `Rated` / `Estimated` / `Observed` (context-dependent) | UI labels |
| `Total In`, `Total Out`, `Total Drop` | `Rated In (Actual) + Unrated In (Estimated)` (Pattern A split) or `Estimated Total In (Derived)` (Pattern B with inputs) | UI labels |
| `Handle` | `Estimated Drop` | UI labels |
| `Chips Out` | `Cash Out` | UI labels + DTO identifiers |
| `Chips In` | `Cash In` | UI labels + DTO identifiers |
| `Win` (unqualified) | `Inventory Win` / `Estimated Win` / `Table Win` / `Pit Win` | UI labels |
| `Theo: 0` | Remove field OR render `<FinancialValue>` with `status: 'unknown'` and explicit "Not computed" badge | UI labels |
| `Coverage` / `Coverage quality` (as KPI) | `Attribution Ratio` | UI labels |
| `totalChipsOut` (DTO) | `totalCashOut` | DTO identifiers |
| `totalChipsIn` (DTO) | `totalCashIn` | DTO identifiers |

---

## 4. Regex specifications (for Phase 1.4 ESLint rule generation)

### 4.1 `Handle` rule with derived-rename exception

```text
Rule ID: no-unqualified-handle-label
Pattern: /\bHandle\b/
Exception: allow if the match is followed (within 40 characters) by /\(\s*Estimated\s+Drop\s*\)/
Error: "SRC §L3 forbids 'Handle' as a label. Use 'Estimated Drop' instead. Transitional label 'Handle (Estimated Drop)' is permitted only for deprecation periods."
```

### 4.2 `Win` rule with qualifier whitelist

```text
Rule ID: no-unqualified-win-label
Pattern: /(?<!(Inventory|Estimated|Table|Pit|Actual|Net)\s)\bWin\b(?!\s*\/\s*Loss)/
Qualifiers allowed before Win: Inventory, Estimated, Table, Pit, Actual, Net
Qualifier allowed after Win: "/Loss" (e.g., "Win/Loss" is acceptable)
Error: "SRC §L3 forbids unqualified 'Win'. Use 'Inventory Win' (observed/custody-derived) or 'Estimated Win' (class B) depending on source."
```

### 4.3 `Coverage` KPI-context rule

```text
Rule ID: no-coverage-kpi-label
Pattern: /\bCoverage(\s+quality)?\b/i
Scope: only flag in files matching /components\/(.*\/)?(metric|kpi|summary|oversight|dashboard).*\.tsx/
       OR in JSX elements named <Metric*>, <KPI*>, <SummaryBand>, <CoverageBadge>, <AttributionRatio>
Error: "SRC §K1 renamed 'Coverage' to 'Attribution Ratio' to prevent conflation with completeness. Use <AttributionRatio> or label 'Attribution Ratio'."
```

### 4.4 `Theo: 0` rule

```text
Rule ID: no-theo-placeholder
Patterns:
  - /Theo\s*:\s*0\b/
  - /Theo\s*:\s*\$0(\.00)?\b/
  - JSX: <*>Theo: {0}</*> or {theoValue === 0 && ...} where the literal 0 reaches a rendered currency slot
Error: "SRC §F4 forbids rendering placeholder zero values as authoritative. Either remove the field until computed, or render with FinancialValue.completeness.status='unknown' and explicit 'Not computed' UI treatment."
```

### 4.5 DTO field-name rule

```text
Rule ID: no-misleading-chips-identifier
Scope: files matching /services\/.+\/dtos\.ts$/
Patterns:
  - TypeScript identifier: totalChipsOut, totalChipsIn, chipsOut, chipsIn (when typed as number/currency)
Error: "SRC §L3 + audit Stream D #2: 'Chips' implies observed authority; rename to 'Cash' variant to match PFT source."
```

---

## 5. ALLOW — labels that MUST appear near currency values

SRC §L1 requires every rendered currency value to declare its authority. Phase 1.4 rule `no-unlabeled-financial-value` enforces this at the DTO and DOM levels; the authority vocabulary allowed in UI is:

| Allowed label | Maps to `FinancialValue.type` | Usage |
|---------------|-------------------------------|-------|
| `Actual` | `'actual'` | Primary display for PFT / loyalty comp face value |
| `Estimated` | `'estimated'` | Primary display for Class B / table-session / rating-slip theo / cash-obs extrapolation |
| `Observed` | `'observed'` | Primary display for pit-cash physical counts / table-inventory attestations |
| `Compliance` | `'compliance'` | Primary display for MTL records |
| `Derived` | (Pattern B composite) | Secondary label for derived totals (SRC §C2); MUST be accompanied by input declaration (§C3) |
| `Attribution Ratio` | (KPI, not a FinancialValue) | Renamed from `Coverage` (§K1) |
| `Draft` | (operator input, not wrapped) | Label for pre-commit form inputs (CLASSIFICATION-RULES §6.1) |
| `Input` | (operator input, not wrapped) | Label for persisted operator parameters like `average_bet` |

**Badge visibility rule (SRC §L2):** all authority labels MUST be visible at first glance — never hidden in tooltips, never assumed by context. The `<FinancialValue>` component enforces this structurally; the lint rule catches legacy inline renders.

---

## 6. Context-sensitive exemptions

### 6.1 Transitional labels during deprecation

During a Phase 1.3 migration window, a deprecated surface may render `Handle (Estimated Drop)` as a transitional label to signal both the legacy name and the correct replacement. Permitted ONLY when:
- The render site has a dated deprecation comment (`// TODO(wave-1-migration): remove by YYYY-MM-DD`).
- The deprecation date is within 30 days of the landing commit.

### 6.2 Third-party library identifiers

If a third-party library exports a prop or token named e.g. `coverage` (for unrelated reasons), it is exempt. Exemption format:

```text
// eslint-disable-next-line no-coverage-kpi-label -- Third-party prop from <Library>; not a financial KPI
```

Phase 1.4 ESLint rule config must require a justification comment on every `eslint-disable-next-line` for these rules.

### 6.3 Test files

`**/*.test.{ts,tsx}` and `**/*.spec.{ts,tsx}` are exempt. Tests often assert on forbidden-label strings to verify the rule works.

---

## 7. Feeds Phase 1.4 lint rule design

Phase 1.4 ESLint work produces two custom rules based on this document:

1. **`no-forbidden-financial-label`** — enforces §2.A–E plus §2.D. Rules generated from §4 regex specs.
2. **`no-unlabeled-financial-value`** — enforces SRC §L1 via `<FinancialValue>` presence check and type-system integration (bare `number` in currency position is a lint error).

Both rules ship with `--fix` support where safe: automatic renames for DTO fields (§2.D), suggestion-level fixes for UI labels (human review required since "Total" → "Rated"/"Estimated" is context-dependent).

**Exit gate verification (Phase 1.4):** CI turns red on any lint violation. `npm run test:surface` includes a grep-based sanity check that no forbidden string appears in `components/` or `app/`.
