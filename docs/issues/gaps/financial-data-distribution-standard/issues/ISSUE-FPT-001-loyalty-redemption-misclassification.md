# ISSUE FPT-001: FACT-LOYALTY-REDEMPTION Misclassification in Provenance Trace

**Severity:** MEDIUM — documentation error; no runtime defect. Misleads downstream specs that cite the trace as authority.
**Discovered:** 2026-04-29 (cross-reference audit of `FINANCIAL-PROVENANCE-TRACE.md` vs live codebase)
**Status:** INTERIM — filed pending full documentation analysis via GitNexus knowledge graph and exhaustive audit pass.
**Affects:** `docs/issues/gaps/financial-data-distribution-standard/FINANCIAL-PROVENANCE-TRACE.md` §B.3

---

## Finding

`FINANCIAL-PROVENANCE-TRACE.md` §B.3 classifies loyalty redemption as `❌ Broken/Missing` with the note "redemption RPC wiring not confirmed."

**The classification was wrong at authoring (2026-04-22).** Redemption was fully implemented and wired.

---

## Evidence

| Surface | Location | Confirms |
|---|---|---|
| Redemption RPC call | `services/loyalty/crud.ts:264` — `supabase.rpc('rpc_redeem', {...})` | RPC wired |
| DTOs | `services/loyalty/dtos.ts:417,447,454,463` | Types defined |
| Mapper | `services/loyalty/mappers.ts:39,232` | Row → DTO transform exists |
| Service interface | `services/loyalty/index.ts:186-187` | Redemption exposed on public service API |
| Unit test | `services/loyalty/__tests__/crud.test.ts:159` | Test coverage present |
| Integration test | `services/loyalty/__tests__/issue-comp.int.test.ts:109` | Integration path exercised |

---

## Root Cause (Hypothesis)

The 6-agent parallel trace used Explore agents rather than direct grep. Explore agents read excerpts and may have missed the `rpc_redeem` call site depending on the read window. The finding was authored without a confirming grep pass.

This is an **authoring error**, not a code gap.

---

## Required Action

- [ ] Correct `FINANCIAL-PROVENANCE-TRACE.md` §B.3: change status from `❌ Broken/Missing` to `✅ Implemented` with evidence citations above.
- [ ] Add `[CORRECTED 2026-04-29]` inline marker so correction is timestamped.
- [ ] Verify no downstream PRD/EXEC-SPEC cited the "Broken/Missing" finding as a gap to close (would create phantom work).

---

## Interim Caveat

This issue was identified via targeted grep. A full GitNexus-assisted analysis (pending re-index completion) may surface additional loyalty flow gaps not yet documented. This issue addresses only the misclassification — it does not imply the loyalty redemption path is architecturally complete.
