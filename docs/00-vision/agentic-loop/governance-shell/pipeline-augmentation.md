# Pipeline Augmentation — the only two hooks (GOV-CANON-SHELL-001 §12)

The shell requires **exactly one** entry gate on the feature-pipeline and **exactly
one** exit handoff on the build-pipeline. No other internal pipeline redesign is
authorized for the trial (G3: no second pipeline).

Both hooks are **additive wrappers** — they do not modify any existing phase, gate,
checkpoint field, or executor routing. They can be removed cleanly if the trial
rejects the shell (§14).

---

## Hook 1 — feature-pipeline ENTRY GATE

> No mapped propagation slice enters design without an authorized Slice Mandate.

**Where:** immediately before feature-pipeline Phase 0 (SRM Check), at `/feature-start`.

**Rule:**

```text
IF the feature originates from the System Canon Propagation Map
   (i.e. it is a mapped remediation slice, not a net-new feature):
     REQUIRE an authorized SLICE-MANDATE-XXX
       - status == authorized
       - human_authorization.authorized_by is set            (G9)
       - preflight.outcome == mandate_ready                  (map_incomplete/map_conflict blocks — §13.1)
     THEN the mandate's fields seed Phase 0–5 context:
       - target.* + canon.*        -> feed the FIB / scaffold intent (NOT a replacement — §5.2)
       - containment.*             -> Phase 0 boundary + Phase 1 non-goals + expansion triggers
       - proof_obligations.*       -> Phase 5 PRD acceptance criteria + classification flags
       - routing.authority_lane    -> which lane authority co-reviews
ELSE (net-new feature, no map origin):
     run feature-pipeline unchanged. The shell does not apply.
```

**What the mandate does NOT do (G4 / §5.2):** it does not contain architecture,
pre-fill the FIB/RFC/ADR/PRD/EXEC, or invoke craftsmen. The feature-pipeline still
owns and authors every design artifact. The mandate only *commissions and bounds*.

**Checkpoint touchpoint (additive, optional):** record `slice_mandate_ref` in the
feature-pipeline checkpoint so traceability (§7.3) can be evaluated. This is a new
*reference*, not a new artifact family.

---

## Hook 2 — build-pipeline EXIT HANDOFF

> Build completion emits evidence for Propagation Certification.
> Build completion does NOT update propagation maturity.

**Where:** at build-pipeline Phase 4 (Completion + DoD Validation), after DoD/Gate
A/Gate B verdicts are recorded — but the handoff is **read-only** over build state.

**Rule:**

```text
ON build-pipeline reaching status: complete:
     EMIT an evidence bundle for the shell (do NOT certify, do NOT touch the map):
       - DoD gate results (type-check / lint / test / build)
       - write-path E2E results        -> feeds proof_class: workflow_certification
       - Gate B render-proof results    -> feeds proof_class: consumer_certification
       - integration/contract test logs -> feeds proof_class: mechanism + producer_capability
       - suppression evidence (removed paths, forbidden-label scans) -> proof_class: suppression
     The build pipeline STOPS here. It does NOT:
       - mark any map node propagated          (G4 — factory never certifies itself)
       - advance maturity                      (G5 — shipping != propagated)
       - collapse the 5 proof classes into "build green" (G6)
```

**Then (outside the build pipeline, by the root authority):**

```text
1. PROPAGATION CERTIFICATION  -> templates/PROPAGATION-CERTIFICATION-TEMPLATE.yaml
     evaluate the 5 proof classes independently over the emitted evidence.
2. MAP UPDATE                 -> REGISTER.yaml (existing schema)
     only this step advances disposition/maturity and unblocks the next slice (G8).
```

**Distinction the handoff enforces (G8):**

| Artifact | Role | Owner |
|---|---|---|
| Slice Mandate | authorized **command** | root authority |
| Build outputs | **evidence** | build-pipeline |
| Certification | **decision over evidence** | root authority |
| Map update | official **observed status** | root authority |

---

## What is intentionally NOT added (§9 non-goals)

No autonomous slice selection · no autonomous phase progression · no workflow engine ·
no agent scheduler · no new implementation-agent hierarchy · no policy engine ·
no graph DB · no RAG dependency · no skill-to-skill chatter · no multi-slice parallel
reconciliation · no deploy automation. New agent roles added by this scaffold: **0**.
New runtime infrastructure added: **0**.
