# ISSUE FPT-003: GAP-U1 — Player Timeline Compliance Panel: `mtlEntries` Wire Not Connected

**Severity:** MEDIUM — floor supervisors have MTL access; the entry list wire in the timeline panel is not connected, meaning per-entry detail is absent from this surface despite the underlying access and data existing.
**Discovered:** 2026-04-29 (cross-reference audit of `FINANCIAL-PROVENANCE-TRACE.md` vs live codebase)
**Revised:** 2026-04-29 — three revisions; original claim ("MTL data never rendered") was wrong; subsequent RLS-boundary framing was unverified inference; current revision reflects only confirmed observations
**Status:** INTERIM — verified by direct file read; GitNexus `cypher` impact trace pending; FINANCIAL-PROVENANCE-TRACE.md §9 correction required
**Affects:**
- `docs/issues/gaps/financial-data-distribution-standard/FINANCIAL-PROVENANCE-TRACE.md` §9 GAP-U1
- `app/(dashboard)/players/[playerId]/timeline/_components/compliance-panel-wrapper.tsx`

---

## Compliance System Architecture

The MTL/CTR compliance system has three distinct surfaces:

| Surface | Route | Purpose | Status |
|---|---|---|---|
| Player timeline compliance panel | `/players/[id]/timeline` | CTR aggregate for operational awareness | ✅ CTR aggregate wired; `mtlEntries` not connected (see below) |
| Compliance dashboard | `/compliance` | Gaming-day summary + MTL entry list | ✅ Fully wired |
| MTL Entry View Modal | Modal on compliance dashboard | Per-entry detail vs $3,000 threshold; print for 31 CFR § 1021.311 | ✅ Fully wired (`useMtlEntries()`) |

Per-entry MTL detail (individual buy-ins, direction, amount, recordedAt, recordedBy) is served from the `/compliance` dashboard and MTL Entry View Modal. The timeline compliance panel currently shows only the CTR aggregate.

---

## Original Trace Finding vs Reality

`FINANCIAL-PROVENANCE-TRACE.md` §9 GAP-U1 mischaracterized this surface:

| Claim in trace | Reality |
|---|---|
| CTR compliance data not rendering / upstream unknown | CTR aggregate renders correctly via `useGamingDaySummary` → `mtl_gaming_day_summary` |
| Implied: individual entry detail missing from system | MTL Entry View Modal is fully wired; per-entry detail is served from `/compliance` dashboard |
| `mtlEntries={[]}` — characterization unclear | Hardcoded; wire to `use-mtl-entries.ts` not connected; reason not established |

---

## Confirmed Observations

`compliance-panel-wrapper.tsx:59` hardcodes `mtlEntries={[]}`. The wrapper fetches CTR aggregate data via `useGamingDaySummary` but never imports or calls `use-mtl-entries.ts`.

```tsx
// compliance-panel-wrapper.tsx
const { data: complianceData } = useGamingDaySummary({ casinoId, gamingDay, patronId: playerId });
// ...
<CompliancePanel playerId={playerId} ctrStatus={ctrStatus} mtlEntries={[]} isLoading={isComplianceLoading} />
```

Consequences of the hardcoded empty array:
- `MtlSummary` (`panel.tsx:296`) returns `null` — cash-in/cash-out entry totals never shown
- `MtlEntryRow` list (`panel.tsx:153`) never renders — per-entry detail absent from timeline panel

`use-mtl-entries.ts` returns real `mtl_entry` rows and is the hook used by the MTL Entry View Modal. It is not imported by the timeline wrapper.

**Why `mtlEntries` is not wired is not established.** Floor supervisors have MTL access. The wire may be an omission or a deliberate surface-scoping decision. This requires clarification before Phase 1.3 scope is set.

---

## Additional Unwired Props

| Prop | Status | Impact |
|---|---|---|
| `onViewHistory` | Not passed | "History" button in panel header never renders; no navigation to `/compliance` from timeline |
| `onMtlClick` | Not passed | If entries were wired, rows would be non-interactive |
| `isFiled` (inside `ctrStatus`) | Hardcoded `false` | Filing workflow is out of current scope; `false` accurately reflects current system state |

---

## What Is Fully Working

- CTR threshold progress bar, near-threshold badge, triggered badge, gaming-day total — ✅ via `useGamingDaySummary`
- $3,000 watchlist floor tracking and per-entry detail in MTL Entry View Modal — ✅ via `useMtlEntries()`
- `/compliance` dashboard with full gaming-day summary and entry list — ✅
- Print layout for 31 CFR § 1021.311 — ✅

---

## Required Actions

### Documentation (immediate)
- [ ] Correct `FINANCIAL-PROVENANCE-TRACE.md` §9 GAP-U1: CTR aggregate renders via `useGamingDaySummary`; `mtlEntries` wire not connected in timeline wrapper; per-entry detail available on `/compliance` dashboard. Add `[CORRECTED 2026-04-29]` marker.

### Pre-Phase 1.3 decision
- [ ] Determine whether `mtlEntries={[]}` is an omission or an intentional surface-scoping decision for the timeline. Floor supervisors have MTL access — the data is accessible; the question is whether the timeline panel is the intended surface for per-entry display.
- [ ] Run GitNexus `cypher` impact trace on `use-mtl-entries.ts` to confirm all consumer surfaces.

### Refactoring (deferred, pending decision above)
- [ ] If per-entry display is in scope for the timeline: wire `use-mtl-entries.ts` into `compliance-panel-wrapper.tsx`, replacing `mtlEntries={[]}`. Decide whether `MtlSummary` cash-in/out grid is additive or duplicative relative to the CTR tile.
- [ ] Wire `onViewHistory` to navigate from timeline compliance panel to `/compliance`.

---

## Governance Reference

- **COMP-002** (`docs/30-security/compliance/COMP-002-mtl-compliance-standard.md`) — authoritative. Defines two thresholds ($3,000 watchlist, $10,000 CTR), immutability policy, RLS access model.
- **FINANCIAL-PROVENANCE-TRACE.md §9 GAP-U1** — requires correction per above.
