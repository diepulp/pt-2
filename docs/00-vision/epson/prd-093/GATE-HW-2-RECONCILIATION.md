# GATE-HW-2 — Retrospective Manual-Evidence Reconciliation

**Gate:** GATE-HW-2 — PRD-092 Linux/CUPS real-device acceptance (Epson TM-T88V on a Linux/CUPS rig).
**Disposition:** `manually_proven_governance_reconciled`
**Evidence type:** `retrospective_manual_acceptance`
**Reconciled by:** ______ (governance authority)  **Date:** ______

---

## Why this artifact exists

The PRD-092 Linux/CUPS **real-device acceptance was performed manually**. The gate nonetheless
remained recorded as OPEN because its governance state was never reconciled after the manual run —
`docs/00-vision/epson/PRD-092-IMPLEMENTATION-PRECIS.md` (lines 26 / 160 / 209) still carries the
stale `OPEN (manual)` status. **That stale status is the bookkeeping this record corrects.** This is a
retrospective reconciliation: the manual evidence is recorded after the fact and the physical test is
**not** repeated.

This record establishes the known-good **Phase-1 physical-printer baseline only**. It does **not**
claim Windows certification — Windows Gate E2 (Gate W-C, PRD-093) remains independently mandatory.

## Reconciled status

| Field | Value |
|-------|-------|
| Prior recorded status | OPEN (manual) — PRD-092 Implementation Precis |
| Actual status | Manually performed; governance record stale |
| Reconciled status | CLOSED — manually proven, governance reconciled |
| Test repeated? | No (retrospective reconciliation) |

## Observed manual evidence (populate from records of the original run)

> Record whatever physical evidence is available from the original manual acceptance. If a specific
> field cannot be substantiated from records, mark it `not-on-file` rather than inventing it — the
> reconciliation rests on the governance authority's attestation that the run occurred.

| Evidence | Value / reference |
|----------|-------------------|
| Date of original manual run | ______ |
| Operator | ______ |
| Rig (host + CUPS queue) | ______ |
| Spooler path used (`createCupsCommandSpooler` / `lp -d <queue>`) | ______ |
| Physical `submitted` outcome confirmed | ______ |
| `print_attempt` audit row confirmed | ______ |
| Receipt photo / scan / log excerpt | ______ |

## Stale-record correction

- ▢ Update `PRD-092-IMPLEMENTATION-PRECIS.md` GATE-HW-2 status from `OPEN (manual)` to
  `CLOSED (manually proven; reconciled — see GATE-HW-2-RECONCILIATION.md)` (optional housekeeping;
  the precis is a synthesis doc, this artifact is the authoritative reconciliation).

## Authority

| Role | Name | Attests run occurred | Date |
|------|------|----------------------|------|
| Governance authority | | ▢ | |
| Lead Architect | | ▢ | |
