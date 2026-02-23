# CSV Player Import — Known Gaps

**Status:** 3 open items
**Related PRDs:** PRD-037, PRD-LOYALTY-TIER-RECONCILIATION-v0
**Bounded Context:** PlayerImportService, LoyaltyService

---

## OPEN-1: Unmapped Columns Not Surfaced in UI (P2)

**Problem:** When a vendor CSV contains columns that don't match any canonical field (e.g., `Loyalty Tier`, `Points Balance`, `Last Activity`), the column mapping step shows them as unmapped but provides no indication that the data is preserved. Users may assume the data is discarded.

**Current behavior:**
- Unmapped columns appear in the mapping dropdown list with no canonical field selected
- Data is silently stored in `import_row.raw_row` (JSONB)
- The preview, report, and CSV download steps never reference unmapped columns

**Expected behavior:**
- Column mapping step shows unmapped columns with a "Stored in raw data" or "Preserved (not imported)" badge
- Report step optionally shows a count of rows with extra metadata
- CSV download includes unmapped columns from `raw_row`

**Where it lives:** `raw_row` JSONB column in `import_row` table. Query:
```sql
SELECT raw_row->>'Loyalty Tier', raw_row->>'Points Balance'
FROM import_row WHERE batch_id = '<id>';
```

**Files affected:**
- `components/player-import/step-column-mapping.tsx` — add unmapped badge
- `components/player-import/step-report.tsx` — optional metadata count
- `components/player-import/csv-download-button.tsx` — include raw_row extras

**Dependency:** None — standalone UX improvement.

---

## OPEN-2: Bare Double-Quotes in CSV Cause Row Loss (P1)

**Problem:** Vendor CSVs containing bare double-quotes inside unquoted fields (e.g., `+HYPERLINK("http://evil.com")`) trigger RFC 4180 quoted-field mode in Papa Parse. The parser consumes subsequent rows as part of the quoted field, silently losing ~29 rows per occurrence.

**Current behavior:**
- Papa Parse with `worker: true` and `header: true` follows RFC 4180 strictly
- A bare `"` in an unquoted field starts a multi-line quoted field
- Rows are silently swallowed until a closing `"` is found
- No error or warning is surfaced to the user

**Expected behavior:**
- Parser tolerates bare quotes in unquoted fields, or
- Pre-parse sanitization strips/escapes problematic characters, or
- UI warns when parsed row count differs significantly from expected line count

**Tracked as:** ISSUE-14957158 (Memori issues namespace)

**Notes:** A pre-parse `sanitizeCsvText()` approach was prototyped and rejected. Alternative approaches to evaluate:
- Papa Parse `quoteChar: false` configuration
- Pre-parse regex to escape bare quotes
- Post-parse row count validation with user warning

---

## OPEN-3: Loyalty Tier Reconciliation Not Yet Built (P1)

**Problem:** Vendor CSVs include loyalty metadata (`Loyalty Tier`, `Points Balance`, `Last Activity`) that is preserved in `raw_row` per ADR-036 D7 but has no reconciliation workflow. Users cannot act on this staged data.

**Current behavior:**
- Loyalty columns land in `import_row.raw_row` JSONB
- No UI reads or displays this metadata post-import
- No path to reconcile imported tiers with canonical `player_loyalty`

**Next step:** Implement PRD-LOYALTY-TIER-RECONCILIATION-v0:
- Review queue screen for players with staged loyalty attributes
- Diff view (imported vs canonical tier/points)
- Upgrade-only policy as MVP default
- Audit trail for apply/revert actions

**Dependency:** PRD-LOYALTY-TIER-RECONCILIATION-v0 (draft in `docs/00-vision/csv-import/`)

---

## Priority Matrix

| ID | Title | Priority | Effort | Dependency |
|----|-------|----------|--------|------------|
| OPEN-1 | Unmapped columns not surfaced | P2 | Small | None |
| OPEN-2 | Bare double-quotes row loss | P1 | Medium | ISSUE-14957158 |
| OPEN-3 | Loyalty tier reconciliation | P1 | Large | PRD-LOYALTY-TIER-RECONCILIATION-v0 |
