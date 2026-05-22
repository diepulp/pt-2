# Feature Intake Brief — Shift Report

## A. Feature identity

- **Feature name:** Shift Report
- **Feature ID / shorthand:** FIB-H (Reporting Layer — Shift Report)
- **Related wedge / phase / slice:** Pilot scope — highest-value polish item after core loop closure
- **Requester / owner:** Vladimir Ivanov
- **Date opened:** 2026-04-15
- **Priority:** P1
- **Target decision horizon:** Pilot
- **Source documents:**
  - `GREENFIELD.md` — metric inventory and report section structure (9 verified data sources, 6-section skeleton)
  - `GAP-ANALYSIS.md` — data source audit, 8 missing sources identified, effort revision
  - `pt2-reporting-layer-so-what-brief.md` (main branch) — commercial framing and five-question framework

## A1. Single-FIB rationale

This remains one FIB because the operator experiences the shift report as one coherent workflow: generate, review, produce canonical artifact, and distribute to stakeholders. Internal execution is partitioned into three bounded lanes for delivery discipline, not because the operator problem is separable.

## A2. Output model

The on-screen report page is a review surface. The canonical Shift Report artifact is a standardized PDF generated from a fixed document template (Shift Report Standard Template v1). Browser print may remain available as a convenience fallback but is not the authoritative artifact path.

**Canonical generation pipeline:** `ShiftReportDTO` → fixed report template → server-generated PDF. This is the frozen architectural direction.

**DTO-first rule:** All business computation, totals reconciliation, quality derivation, and field preparation must occur before rendering. The report template consumes a display-ready `ShiftReportDTO` and introduces no independent business logic. The document layer is presentational only.

**Server ownership rule:** The client may request preview, PDF generation, and manual distribution actions, but the canonical report artifact is generated server-side. The browser does not own the authoritative PDF generation path.

**Output modes:**
- **Preview** — on-screen operator inspection (review surface)
- **Artifact** — canonical PDF generated server-side from the fixed template
- **Print** — from canonical PDF artifact; browser print as convenience fallback only
- **Distribution** — manual sending of canonical PDF to defined recipient classes

## A3. Internal workstream partition

**WS1 — Report Assembly**
Construct a read-only `ShiftReportDTO` from existing service outputs only.

Allowed work:
- Field mapping and section composition
- Totals reconciliation
- Snapshot assembly
- Read-only aggregation using already-served data

Not allowed under WS1:
- New domain logic or report-only business rules
- New persistence or schema work
- New RPC/view creation unless the FIB is amended

**WS2 — Canonical Report Rendering**
Render the assembled `ShiftReportDTO` into both an on-screen review surface and a fixed Shift Report Standard Template v1 suitable for canonical PDF generation.

Allowed work:
- On-screen report rendering (review surface)
- Standardized layout with controlled pagination
- Canonical PDF artifact generation
- Template styling and print-safe formatting
- CSV export for the Section 1 per-table financial summary rows only
- Browser print as convenience fallback

Not allowed under WS2:
- Independent business logic, calculation, or thresholding in the template layer
- Configurable layouts or multi-template support
- Report-builder behavior
- Export of any report section beyond Section 1 financial summary (CSV)

**WS3 — PDF Generation and Distribution**
Generate the canonical Shift Report PDF server-side from the fixed report template and support bounded manual distribution of that artifact.

Allowed work:
- Server-side PDF generation from rendered report template
- Manual send action from the report page
- Attachment of canonical PDF to email
- Bounded recipient selection from defined recipient classes (incoming supervisor, GM, finance stakeholder, compliance stakeholder)

Not allowed under WS3:
- Client-side PDF generation as the primary artifact path
- Scheduled or recurring delivery
- Routing rules engine or automatic recipient resolution
- Multi-recipient policy logic beyond simple bounded send
- Persistent report archival records or document registries
- Signing, certification, or watermark workflows

## B. Operator problem statement

When a pit boss closes a shift, they need to produce a handoff document for the incoming supervisor and a summary for the GM. Today this requires visiting 5–6 separate screens, mentally stitching numbers together, and manually transcribing them. This is slow, error-prone, and makes the system feel incomplete — a system that records everything but cannot produce a single page that says "here is what happened" fails the basic trust test for casino floor management.

## C. Pilot-fit / current-slice justification

The pilot is selling PT-2 as a system that produces management-grade operational proof. Without a report, the system captures events but cannot present them as a coherent narrative. The pit boss's daily output artifact — the shift report — is the one document that management, finance, and compliance stakeholders will actually read. Deferring this means the pilot operator falls back to screenshots and manual transcription, which erodes exactly the trust the pilot is trying to build. The data already exists across built services; the gap is assembly, canonical rendering, and bounded distribution.

## D. Primary actor and operator moment

- **Primary actor:** Pit boss / floor supervisor
- **When does this happen?** End of shift, during shift handoff, or on-demand during the shift for a progress snapshot
- **Primary surface:** New page at `/admin/reports/shift-summary`
- **Trigger event:** Pit boss decides to review or hand off shift status — typically at shift close, when the GM requests a summary, or when a compliance event needs documentation

## E. Feature Containment Loop

1. Pit boss navigates to the shift report page → system shows a date picker (gaming day) and shift selector based on existing casino-configured shift boundaries only (swing/day/grave). Custom time windows are excluded from MVP scope.
2. Pit boss selects gaming day and configured shift boundary → system fetches and assembles data from existing services in parallel, shows a loading state
3. System renders the consolidated report on screen → pit boss sees a structured document with financial summary, rating activity, compliance triggers, anomaly/exception status, baseline quality, and loyalty liability — all on one page
4. Pit boss reviews the report sections, scrolling through the document → system highlights sections that contain actionable items. Any highlighting or emphasis must be purely derivative of existing service states (e.g., unresolved alerts, weak coverage tiers, compliance triggers already flagged). The report introduces no new interpretive scoring, thresholding, or prioritization logic.
5. Pit boss clicks "Generate PDF" → system generates the canonical Shift Report PDF server-side from the `ShiftReportDTO` via the fixed Shift Report Standard Template v1 with controlled pagination and standardized layout. The browser does not own this generation path. Browser print remains available as a convenience fallback only.
6. Pit boss clicks "Export CSV" on the Section 1 financial summary table → system generates a CSV file of the per-table financial rows only and triggers a browser download. No other report sections are CSV-exportable in MVP.
7. Pit boss clicks "Send Report" → system presents a bounded recipient selection (incoming supervisor, GM, finance, compliance) and sends the canonical PDF as an email attachment via the project's approved email pathway. No scheduled delivery, no automatic routing.
8. Report recipients receive a self-contained PDF document that does not require system access to read, print, or archive.

## E1. Shift Report Standard Template v1

The canonical Shift Report is a standardized document with fixed section order. Field lists below are the **metric contract** — downstream artifacts must include these fields and may not add fields absent from this list without amendment. Source provenance: GREENFIELD.md (metric inventory) + GAP-ANALYSIS.md (corrections and additions).

1. **Report Header**
   - Casino name
   - Property / pit
   - Gaming day
   - Shift boundary (swing/day/grave)
   - Generated timestamp
   - Generated by (staff name)
   - Report reference ID
   - Internal / confidential marking

2. **Executive Summary Strip**
   - Total drop
   - Total fills
   - Total credits
   - Total win/loss
   - Hold %
   - Total theo generated
   - Rating coverage %
   - Active rated / unrated visitor counts
   - Anomaly alert count (total, unresolved)
   - Compliance trigger count (MTL + CTR)

3. **Section 1 — Financial Summary**
   - Per-table rows: table label, game type, drop, fills, credits, win/loss, hold %
   - Cash observation rollup per table (telemetry-grade, supplementary to inventory-based metrics)
   - Casino-level totals row
   - Source: `rpc_shift_table_metrics`, `rpc_shift_casino_metrics`, cash observation RPCs

4. **Section 2 — Rating / Coverage Quality**
   - Total rated sessions count, unrated sessions count
   - Rating coverage % (casino-level and per-table breakdown)
   - Active rated / unrated visitor counts (from `rpc_shift_active_visitors_summary`)
   - Average bet range across tables (from shift metrics rated drop / rated session count)
   - Total theo generated
   - Theo discrepancy summary (computed vs legacy, if resolved into scope — see open question)
   - Source: `measurement_rating_coverage_v`, `rpc_shift_active_visitors_summary`, shift metrics

5. **Section 3 — Compliance Summary**
   - MTL trigger count
   - CTR trigger count
   - Summary-level only: aggregate volumes, trigger counts by type
   - Patron-level detail (names, individual amounts) is **excluded from MVP** unless compliance review requires it — this is a deliberate containment decision, not an oversight
   - Source: `mtl_gaming_day_summary` view

6. **Section 4 — Exceptions and Anomalies**
   - Total alerts fired, broken down by severity (critical/warning/info)
   - Alerts acknowledged (count)
   - Alerts unresolved (count)
   - False positives flagged (count)
   - Alert quality telemetry (acknowledgment rate, false-positive rate)
   - Staff attribution on acknowledgments is **excluded** (requires FIB-H-A1 amendment)
   - Source: `rpc_get_anomaly_alerts`, `shift_alert` + `alert_acknowledgment`, `rpc_get_alert_quality`

7. **Section 5 — Baseline / Evidence Quality**
   - Tables with opening snapshot (count, % of total tables)
   - Provenance breakdown: count by source category (prior-day close, manual entry, fill observation, no snapshot)
   - Audit correlation completeness (from `measurement_audit_event_correlation_v`)
   - Evidence quality statement (derivative of coverage tier + provenance + audit correlation)
   - Source: `opening_source` from `ShiftTableMetricsDTO`, `measurement_audit_event_correlation_v`

8. **Section 6 — Loyalty Liability**
   - Outstanding loyalty points (total)
   - Enrolled player count
   - Estimated dollar liability (from snapshot)
   - Valuation policy version and cents-per-point rate
   - Source: `loyalty_liability_snapshot`, `loyalty_valuation_policy`

9. **Footer / Attestation Block**
   - Generated by (staff name)
   - Optional: reviewed by
   - Page numbering
   - Report reference ID
   - Point-in-time disclaimer

## E2. Document sanitation rule

The canonical Shift Report document must be:
- Fixed in section order and typography
- Free of navigation chrome and interactive controls
- Free of screen-responsive layout dependency
- Controlled for pagination
- Suitable for print and PDF archival
- Reviewed for sensitive-data exposure appropriate to the recipient class

This is a document template, not a raw printed web screen. If different recipient classes require different content redaction or detail levels, that is not to be solved in MVP by multiple templates unless a compliance review proves that a single-template model is unsafe.

## F. Required outcomes

- A single page consolidates data from the services and views enumerated in Section I into a structured shift report — the pit boss does not visit multiple screens
- Financial totals (drop, fills, credits, win/loss, hold %) on the report match the existing shift dashboard — the report is a read-only view of authoritative data, not a second source of truth
- The report answers three questions visibly: what did the floor produce, what was abnormal, and how trustworthy is the picture
- The Shift Report PDF is generated server-side from a fixed report template using a canonical `ShiftReportDTO`. No business logic resides in the template or PDF generation layers.
- Canonical PDF generation produces a professional, standardized, circulation-ready Shift Report suitable for printing, email attachment, and archival. Browser print remains available as an operator convenience fallback.
- The on-screen report page acts as a review surface; it is not itself the authoritative report artifact
- Manual email distribution of the canonical Shift Report PDF is supported for involved stakeholders (incoming supervisor, GM, finance, compliance)
- CSV export applies only to the Section 1 per-table financial summary rows. No other report sections are exportable in MVP.
- The report loads within 3 seconds for a casino with up to 50 tables (existing BFF endpoint already meets this)
- The canonical report must use a fixed template with controlled pagination, standardized layout, no dashboard chrome, and no interactive UI residue
- No new database migrations, RPCs, or security model changes — assembly and rendering only

## G. Explicit exclusions

- **Staff attribution / "Who acted?" section** — no general audit query service exists; building one is a separate feature (Gap #8 from GAP-ANALYSIS)
- **Scheduled email delivery, recurring distribution automation** — the operator manually generates and sends the report; no cron-based or rules-driven distribution
- **Automatic recipient resolution or routing rules engine** — recipient selection is manual from defined classes only
- **Multi-template support or recipient-specific template variants** — MVP uses one standard template (Shift Report Standard Template v1)
- **Historical trend analysis or comparative reporting** (shift-over-shift, week-over-week) — this is analytics, not operational reporting
- **Custom report builder or configurable sections** — the report layout is fixed for MVP
- **Cross-property portfolio reporting** — recognition service exists but multi-property aggregation is post-pilot
- **Promo coupon activity section** — data exists in `services/loyalty/promo/` but adding promo exposure to the report is a separate intake item
- **Player exclusion activity section** — data exists in `services/player/exclusion*.ts` but compliance-grade exclusion reporting is a separate intake item
- **New top-level navigation entry** — the report page lives under the existing `/admin/` route group
- **Real-time / live-updating report** — the report is a point-in-time snapshot, not a live dashboard
- **Custom time windows** — report uses casino-configured shift boundaries only; arbitrary start/end times are excluded from MVP
- **Export of non-financial sections** — CSV export is limited to Section 1 per-table financial summary rows; no other sections are exportable in MVP
- **New scoring, thresholding, or prioritization logic** — report highlighting is derivative of existing service states only
- **Client-side PDF generation as primary artifact path** — canonical PDF is server-generated; client-side export (jsPDF, html2canvas) is not the approved approach
- **Independent business logic in the template or rendering layer** — the document layer is DTO-first and presentational only

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Staff attribution audit section ("Who acted?") | The "So What" brief's Question 4 explicitly requires accountability signals. Gap analysis confirmed no service layer exists. | Building a staff-action aggregation view/RPC is a prerequisite that does not exist. Introducing it here would turn a pilot-bounded report assembly + presentation task into a 10+ day data-layer + rendering task. Defer to FIB-H-A1 amendment when the audit query service ships. |
| ~~Server-side PDF generation~~ | ~~Casino managers often email shift reports as PDF attachments.~~ | **Moved into scope via amendment FIB-H-A2.** Canonical PDF generation is now the authoritative artifact path. Browser print is a convenience fallback only. |
| Comparative / trend reporting | Pit bosses would benefit from seeing how today compares to the same day last week. | Requires a time-series query pattern and storage model that does not exist. This is analytics-grade work, not operational reporting. Separate feature. |
| Player exclusion + promo sections | Gap analysis identified these as data sources the GREENFIELD missed. Both have service layers ready. | Each adds a report section that requires its own data assembly, DTO, and rendering. Including them silently expands scope. Better to ship the core 5-section report and add sections via intake amendments. |
| Real-time streaming report | The shift dashboard already streams updates; a live report sounds natural. | A report is a snapshot, not a dashboard. Mixing metaphors creates UX confusion about what the printed document represents versus what the screen shows. |
| Custom time windows | Operators may want to pull a report for "the last 4 hours" or an arbitrary window. | Drags the feature toward generalized reporting semantics and interpretation disputes. Casino-configured shift boundaries provide the containment loop's natural unit. Deferred. |
| Closed-session count in report | GREENFIELD proposed "closed sessions summary" as Section 2 data. | Existing RPC returns active visitors, not closed sessions. Deriving closed count requires a new query path, violating the assembly-only constraint. Removed per mandate #3, Option B. |
| Client-side PDF generation (jsPDF, html2canvas) | Common implementation pattern for browser-based export. | Introduces browser-specific variability, weaker control over formatting, and brittle output. Rejected per amendment FIB-H-A3 in favor of server-generated PDF from canonical DTO via fixed template. |

## I. Dependencies and assumptions

- **Existing BFF endpoint** (`GET /api/v1/shift-dashboards/summary`) returns casino + pits + tables financial metrics in a single call — this is the primary data source for Section 1 and partially Section 5
- **Shift intelligence service** (`services/shift-intelligence/`) provides `getAlerts()` and `getAlertQuality()` for Section 4 (Anomalies)
- **Anomaly alerts service** (`services/shift-intelligence/anomaly.ts`) provides `getAnomalyAlerts()` for baseline-aware anomaly detection
- **MTL service** (`services/mtl/crud.ts`) queries `mtl_gaming_day_summary` view for Section 3 (Compliance)
- **Measurement service** (`services/measurement/queries.ts`) provides `queryRatingCoverage()`, `queryAuditCorrelation()`, `queryLoyaltyLiability()`, and `queryTheoDiscrepancy()` for Sections 2, 5, and 6
- **Cash observation rollups** (`services/table-context/shift-cash-obs.ts`) provide telemetry-grade financial observations — included in Section 1 as supplementary data alongside inventory-based metrics
- **Visitors summary RPC** (`rpc_shift_active_visitors_summary`) returns active rated/unrated counts. **Closed-session count is removed from MVP scope** (the existing RPC reports active visitors only; producing a closed-session count would require either a filtered visit query or a new RPC, both of which violate the "assembly only" constraint). If closed-session count is needed later, it requires formal amendment per mandate #3.
- **Email service** (`services/email/`) — project's approved email pathway for WS3 manual distribution of canonical PDF attachments
- **No new migrations or RPCs assumed** — all data sources already exist and are API-served
- **Gaming day / shift time window** derivation must use the same logic as the existing shift dashboard (casino settings → shift boundaries)

## J. Out-of-scope but likely next

- **Staff attribution section** (FIB-H-A1) — requires a new audit query service/view before it can be added to the report
- **Scheduled report distribution** — automated cron-based or event-triggered email delivery of the canonical PDF
- **Gaming-day report** (full-day aggregate across all shifts) — natural extension once the shift-level report is stable

## K. Expansion trigger rule

Amend this brief if any downstream artifact proposes:
- a new report section not listed in the containment loop step 3
- a new data source not listed in Section I (Dependencies)
- a new export format beyond canonical PDF, browser print, and CSV
- a new actor or workflow (e.g., GM self-service, compliance officer view)
- any database migration, new RPC, or security model change
- multiple report templates or redaction variants by recipient class
- scheduled or automatic email delivery
- automatic recipient resolution or routing rules
- persistent report archival records or document registries
- signing, certification, or watermark workflows
- client-side PDF generation becoming the primary artifact path
- role-based or recipient-specific report variants
- document builder or user-configurable layout semantics
- artifact snapshot persistence or document registry

**Feature-specific note:** Adding the "Who acted?" staff attribution section requires amendment FIB-H-A1 and depends on a staff audit query service that does not yet exist.

**Data substrate rule:** If implementation reveals that the report cannot be assembled exclusively from existing services, routes, views, and already-accepted read pathways, the feature must pause for amendment rather than inventing new report-specific data infrastructure under the same intake.

## L. Scope authority block

- **Intake version:** v0.4 (metric contract reconciliation)
- **Amendments applied:**
  - `fib-shift-report-alteration-mandate.md` — 7 containment tightening changes (v0.1)
  - `fib-amendment-canonical-report-output.md` — canonical PDF + manual email distribution (v0.2)
  - `fib-amendment-pdf-rendering-direction.md` — DTO-first, server-generated PDF pipeline, client-side rejection (v0.3)
  - Metric contract reconciliation — GREENFIELD.md provenance added, E1 fields enumerated per section (v0.4)
- **Frozen for downstream design:** No — pending human review
- **Downstream expansion allowed without amendment:** No
- **Open questions allowed to remain unresolved at scaffold stage:**
  - Cash observation data: inline in financial summary table or separate sub-section? (can resolve at PRD stage)
  - Theo discrepancy: include as a quality badge in Section 2 or defer? (can resolve at PRD stage)
- **Resolved questions:**
  - ~~Closed session count~~ — **Resolved as Option B (removed from MVP).** The existing `rpc_shift_active_visitors_summary` reports active visitors only. Producing a closed-session count would require a new query or RPC, violating the assembly-only constraint. Deferred to amendment.
- **Human approval / sign-off:** [Pending]

---

## Appendix: Report Section ↔ Data Source Map

Reference for downstream artifacts. Each section traces to verified data sources from GAP-ANALYSIS.md.

| Report Section | Data Sources | Service Location | API Endpoint (if exists) |
|---|---|---|---|
| **1 — Financial Summary** | `rpc_shift_table_metrics`, `rpc_shift_casino_metrics`, cash observation rollups | `services/table-context/shift-metrics/service.ts`, `services/table-context/shift-cash-obs.ts` | `/api/v1/shift-dashboards/summary`, `/api/v1/shift-dashboards/cash-observations/*` |
| **2 — Rating Activity** | `measurement_rating_coverage_v`, `queryTheoDiscrepancy()`, `rpc_shift_active_visitors_summary` | `services/measurement/queries.ts`, `app/api/v1/shift-dashboards/visitors-summary/route.ts` | `/api/v1/measurement/summary`, `/api/v1/shift-dashboards/visitors-summary` |
| **3 — Compliance** | `mtl_gaming_day_summary` | `services/mtl/crud.ts` | `/api/v1/mtl/gaming-day-summary` |
| **4 — Anomalies & Exceptions** | `rpc_get_anomaly_alerts`, `shift_alert` + `alert_acknowledgment`, `rpc_get_alert_quality` | `services/shift-intelligence/anomaly.ts`, `services/shift-intelligence/alerts.ts` | `/api/v1/shift-intelligence/anomaly-alerts`, `/api/v1/shift-intelligence/alerts` |
| **5 — Baseline Quality** | `opening_source` from `ShiftTableMetricsDTO`, `measurement_audit_event_correlation_v` | `services/table-context/shift-metrics/service.ts`, `services/measurement/queries.ts` | `/api/v1/shift-dashboards/summary` |
| **6 — Loyalty Liability** | `loyalty_liability_snapshot`, `loyalty_valuation_policy` | `services/measurement/queries.ts:238` | `/api/v1/measurement/summary` |
