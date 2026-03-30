
---

## FIB vs Containment Protocol Audit

### Seven-Question Filter

| # | Question | Answer | Signal |
|---|----------|--------|--------|
| 1 | What exact pilot scenario fails without this? | Custody handoff between shifts has no digital trail. Win/loss degrades silently with no opening snapshot. But the pilot loop (open table → seat players → rate → close) **completes without it**. | AMBER |
| 2 | Who fails, specifically? | Incoming pit boss has no system-enforced verification. But they can still open tables and operate. | AMBER |
| 3 | Can they still complete the task without it? | **Yes.** One-click ACTIVE works today. Sessions open, gameplay proceeds, slips are created. | DEFER signal |
| 4 | Is there a manual workaround for 4 weeks? | **Yes.** Pit bosses already do the physical custody handoff with paper slips. The digital system just doesn't enforce it. | DEFER signal |
| 5 | Does this add a new axis of variability? | **Yes.** New session state transition (OPEN → ACTIVE), new table (`table_open_attestation`), new UI surface (activation drawer), new RPC, variance computation, bootstrap vs broken-chain branching. | DEFAULT = NO |
| 6 | Does it touch more than one bounded context? | No — stays within TableContext. | PASS |
| 7 | If I defer this, does pilot actually die? | **No.** Pilot runs fine with one-click ACTIVE. | DEFAULT = DEFER |

**Filter verdict: 3 of 4 decision rules point to DEFER.**

---

### Scope Bucket Classification

Under the containment protocol's rules, this feature lands in **Bucket 2 (Stabilize Later)** — not Bucket 1 (Ship Now).

It is useful, operationally important, and the right next step after PRD-057. But it does not fix a demonstrated failure in the canonical pilot loop. The pilot loop completes without it.

It avoids Bucket 3 (Ban) because it does not expand the system into a new domain — it deepens an existing workflow within TableContext.

---

### Specific Scope Creep Risks Within the FIB

**1. Activation drawer is a new surface.**
Containment protocol: *"No new surfaces unless the canonical loop lacks a necessary step."* The current loop works without this surface. The FIB correctly scopes it to the existing pit terminal (not a new page), but it is still a net-new UI component with its own state, inputs, and branching logic.

**Risk level:** Moderate. Mitigated by embedding in existing pit terminal rather than creating a new route.

**2. Steps 7 and 8 are branching paths, not a linear loop.**
The containment loop has 6 linear steps (1–6) plus 2 conditional branches (7: bootstrap, 8: broken chain). The protocol says 5–10 steps of actor + action + response. These branches add two additional activation flows with different rules, different UI states, and different guard logic.

**Risk level:** High. Three activation paths (normal, bootstrap, broken-chain) is three axes of variability, not one. The containment protocol says: *"One axis of variability at a time."*

**3. Denomination-level entry (step 3).**
"Enters the current opening amount by denomination" requires a chipset input component (denomination × count grid). A simple total-cents entry would satisfy the custody chain with far less UI complexity.

**Risk level:** Moderate. The chipset input already exists for closing snapshots (`rpc_log_table_inventory_snapshot` takes JSONB chipset). But wiring it into the activation flow is new surface work.

**4. Variance computation + policy tolerance.**
Computing variance and displaying it is a new calculation layer. The FIB says "hardcoded or pit-boss-discretion" — but even recording variance introduces a decision boundary (clean vs exceeded) that drives branching (step 4 vs step 5).

**Risk level:** Low-moderate. Could be simplified to "record both numbers, let the pit boss decide" without system-enforced tolerance thresholds.

**5. Supervisor override flow (step 5).**
Introduces role-based escalation: pit boss cannot activate alone when variance exceeds tolerance, must request supervisor override. This is a new authorization path that doesn't exist anywhere else in the system.

**Risk level:** High. New authorization concept. The containment protocol would flag this as *"future-proofing disguised as safety."*

**6. Closing slip sealing.**
Even with just an `is_sealed` flag + application enforcement, this adds mutation semantics to existing `table_inventory_snapshot` records. Every write path to that table must now check sealing state.

**Risk level:** Low-moderate. Narrow schema change, but enforcement surface area is wider than the column suggests.

---

### What the Containment Protocol Would Cut or Defer

If applying the protocol strictly:

| FIB Element | Protocol Verdict | Reasoning |
|---|---|---|
| OPEN → ACTIVE two-step with attestation | **Keep but simplify** | Core value of the feature — this is the custody chain |
| Prior closing slip as predecessor anchor | **Keep** | This is the operational insight — correct and narrow |
| Opening attestation record | **Keep** | Necessary to record the handoff act |
| Denomination-level chipset entry | **Defer** | Total-cents entry is sufficient for custody proof. Chipset detail is operational richness, not pilot necessity. |
| Variance computation + display | **Simplify** | Record prior close total and current opening total. Display both. Let pit boss decide. No system-enforced tolerance threshold. |
| Supervisor override flow (step 5) | **Defer** | New authorization axis. Manual workaround: pit boss calls supervisor, supervisor overrides physically, pit boss attests with a note. |
| Bootstrap path (step 7) | **Keep but simplify** | Needed for first-open. But don't build a separate UI mode — just show "no prior slip, attest against par" in the same drawer. |
| Broken-chain blocking (step 8) | **Defer or soften** | Show a warning, don't hard-block. A pit boss stuck at a blocked table with no admin available is an operational failure. Warn + require note is sufficient for pilot. |
| Closing slip sealing (`is_sealed`) | **Defer** | Application-level "don't edit finalized snapshots" already exists implicitly. Explicit sealing adds enforcement overhead for a scenario that hasn't been demonstrated as a pilot failure. |
| Dual signature (dealer + pit boss) | **Keep as-is** | It's a nullable column. Zero implementation cost beyond the schema. |

---

### Honest Assessment

The FIB is well-written, correctly excludes adjacent temptations, and the custody chain insight is operationally real. But under the containment protocol, it carries **3 over-engineering risks**:

1. **Three activation paths** (normal / bootstrap / broken-chain) when one path with conditional warnings would survive pilot
2. **Supervisor override authorization** — a new axis of variability with no pilot-demonstrated failure
3. **Variance policy enforcement** — computation and threshold logic when "show both numbers, pit boss decides" is sufficient

The FIB's own framing ("post ADR-047 Phase 1–2") correctly positions this as Stabilize Later, not Ship Now. The question for you: **do you want to trim the FIB to a containment-safe version, or keep it as the full-scope intent document and let the PRD/EXEC slice it?**