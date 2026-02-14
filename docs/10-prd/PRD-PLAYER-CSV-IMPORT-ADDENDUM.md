---
title: "ADDENDUM: Runtime CSV Intake Without Legacy File Access"
doc_type: prd_addendum
product: "Casino Player Tracker (PT-2)"
parent_prd: "PRD-PLAYER-CSV-IMPORT"
version: "v0.1"
status: draft
last_updated: 2026-02-12
---

# Addendum: Import Design When No Legacy CSV Is Available

## Context
During development, the team may **not** have access to a customer’s legacy CSV export. This addendum defines how to ship a robust onboarding import feature **without** building a universal importer or overfitting to a single legacy format.

## Key Decision
When legacy files are unavailable, the product must treat CSV import as **contract-driven intake** with a **mapping-first** UX.

The casino provides the data. The system provides:
- a **template** to guide exports,
- a **mapping preview** to handle unknown headers,
- a **dry-run** mode to prevent destructive writes.

---

# Additions to Scope (MVP)

## New In-Scope Requirements
1. **Downloadable CSV Template**
   - Provide an “Export Template” (blank) and “Sample Template” (with example rows).
   - Template fields align to **Import Contract v1**.
   - Enforce rule: each row must include at least one strong identifier.

2. **Mapping-First Flow (Header Agnostic)**
   - After upload, display detected headers + sample rows.
   - Auto-suggest mappings using an alias dictionary.
   - Allow user to override mappings.
   - Unmapped columns are preserved as raw payload.

3. **Dry Run as Default**
   - Validate and generate an import report **before** any DB writes.
   - “Import” button appears only after dry run completes.

---

# Template Contract (Operational)

## Template Columns (Recommended)
- `external_id` (optional)
- `loyalty_id` (optional)
- `email` (optional)
- `phone` (optional)
- `first_name`
- `last_name`
- `dob` (optional)
- `tier` (optional)
- `notes` (optional)

## Required Rule
Each row must contain **at least one** of:
- `external_id` OR `loyalty_id` OR `email` OR `phone`

Rows failing this rule are **skipped** and listed in the report.

---

# Runtime Behavior Changes (Because Input Is Uncontrolled)

## Defensive Header Normalization
Normalize incoming header strings before alias matching:
- trim whitespace
- lowercase
- remove punctuation (`-`, `.`, `#`, etc.)
- collapse spaces/underscores consistently

Example:
- `Phone Number` → `phone_number`
- `E-mail` → `email`

## Date Parsing Guardrail
DOB formats vary wildly. Add one of:
- a mapping-step dropdown: **Date format: MM/DD/YYYY vs DD/MM/YYYY vs YYYY-MM-DD**
- OR reject ambiguous dates unless ISO format is provided

---

# Upsert Key Strategy (Critical)

## Problem
Without knowing what identifiers the casino can export, upsert logic cannot rely on a single consistent column.

## Preferred MVP Solution: `player_identifier` Table
Introduce a dedicated identifier table:
- `casino_id`
- `player_id`
- `identifier_type` (email/phone/external_id/loyalty_id)
- `identifier_value` (normalized)
- Unique constraint on `(casino_id, identifier_type, identifier_value)`

This enables deterministic upsert by **any** available identifier per row.

## Acceptable Fallback (If Schema Change Is Blocked)
Require one identifier type in the template (e.g., `loyalty_id` or `external_id`) and make it mandatory.

This reduces flexibility and increases customer friction, but keeps schema unchanged.

---

# Implementation Notes (Runtime)

## TS-Only Runtime (No Python)
The importer should be implemented entirely in the Next.js/Node runtime:
- Upload handler receives `multipart/form-data`
- CSV parsing uses streaming (`csv-parse` or `fast-csv`)
- Row pipeline: parse → normalize → validate → batch upsert
- Import report returned and optionally persisted

## Rationale
Python is only justified if:
- imports must run as queued ETL jobs at large scale, **and**
- the org already operates Python worker infrastructure.

This is explicitly **post-MVP**.

---

# UX Additions (Wizard)

## Wizard Step (Optional Placement)
- During onboarding: “Import Players (Optional)”
- Or immediately post-onboarding: “Import Players” as the first admin task

## Outputs
- Dry-run report shown inline
- Downloadable report (CSV/JSON)
- Clear conflict section: “Needs Review”

---

# Acceptance Criteria (Addendum)

1. User can download a blank CSV template and a sample template.
2. Upload accepts unknown headers and allows mapping to Import Contract fields.
3. Dry run runs by default and produces a report without DB writes.
4. Import only proceeds after dry run success.
5. Import is deterministic and uses strong identifiers (preferably via `player_identifier`).
6. Unmapped columns are preserved as raw payload.
7. Report includes row numbers and reason codes for all skipped/conflict rows.
