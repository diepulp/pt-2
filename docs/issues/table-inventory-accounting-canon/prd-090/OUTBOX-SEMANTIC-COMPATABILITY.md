**Q1 — Conflict with outbox discriminator fields (`fact_class`, `origin_label`, `event_type`)**

**NOT REQUIRED.** No conflict exists. The two vocabularies operate at different semantic layers and do not touch the same schema.

| PRD-090 term                            | Layer                                | Outbox field it could touch                                       | Verdict                       |
| --------------------------------------- | ------------------------------------ | ----------------------------------------------------------------- | ----------------------------- |
| `calculation_kind`                      | Projection discriminator on DTO      | None — no outbox field                                            | Clean separation              |
| `drop_estimate_state`                   | Projection state on DTO              | None                                                              | Clean separation              |
| `custody_status`                        | Authority envelope on DTO            | `origin_label` (see Q4)                                           | Different layer — no conflict |
| `telemetry_derived_drop_estimate_cents` | Derived value — never authored       | None                                                              | Read-only; no outbox row      |
| `opener` / `closer`                     | Domain roles for snapshot resolution | None — `table_inventory_snapshot` rows aren't in the outbox today | No action                     |
| `integrity_failure`                     | Three-result-state discriminator     | None                                                              | Projection-only concept       |

PRD-090 is a pure projection consumer in Wave 2 UL terms. It reads from source tables (`table_buyin_telemetry`, `table_fill`, `table_credit`, `table_inventory_snapshot`) and derives a result. It never authors a fact, never emits to `finance_outbox`, and the discriminator fields on the outbox schema (`fact_class`, `origin_label`, `event_type`) are set at authoring time and travel immutably to the source tables PRD-090 reads from. There is no path by which PRD-090 vocabulary touches those fields.

---

**Q2 — Outbox event catalog: new entries or amendments needed for PRD-090's consumed inputs**

**NOT REQUIRED.** All three consumed input paths are already in the catalog:

| PRD-090 consumed input                        | Source path                                                       | Existing catalog entry                                                           | Status                          |
| --------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| `RATED_BUYIN` rows in `table_buyin_telemetry` | `bridge_rated_buyin_to_telemetry()` trigger (fires on PFT INSERT) | `buyin.recorded` (Class A) → bridge emits `event_type = 'buyin.observed'` to TBT | Stable — Bug-2 fixed in PRD-082 |
| `GRIND_BUYIN` rows in `table_buyin_telemetry` | `rpc_record_grind_observation`                                    | `grind.observed` (Class B, `origin_label: estimated`)                            | Proven — Phase 2.0 exemplar     |
| `table_fill` rows                             | `rpc_request_table_fill`                                          | `fill.recorded` (Dependency Event, `origin_label: estimated`)                    | Proven — Phase 2.2              |
| `table_credit` rows                           | `rpc_request_table_credit`                                        | `credit.recorded` (Dependency Event, `origin_label: estimated`)                  | Proven — Phase 2.2              |

PRD-090 reads these rows from the source tables directly. It does not consume them from the outbox relay path. The catalog entries are relevant only to downstream projection consumers of those events — PRD-090 is not one of them. No new event_type registrations, no catalog amendments.

---

**Q3 — Is `TableInventoryAccountingProjection` a Projection Artifact? Does that require anything from the outbox?**

**Classification: Projection Artifact. Outbox requirement: NOT REQUIRED.**

By the Wave 2 UL definition, `TableInventoryAccountingProjection` is unambiguously a **Projection Artifact**: a derived read model produced from Projection Inputs (Authority Facts via RATED_BUYIN bridge, Telemetry Facts via GRIND_BUYIN, Dependency Events via fills/credits/snapshots). It is rebuildable on demand, stateless, and carries no authoring authority.

The key distinguishing fact: PRD-090's projection is *read-time and stateless*. The outbox propagation path applies to Projection Inputs that must be persisted in projection stores so consumers can maintain derived state across requests. Because `TableInventoryAccountingProjection` re-derives on every call from source tables, it does not require a projection store, and therefore does not require an outbox consumer path.

ADR-059 §4 explicitly rejects the persisted projection store for this slice: "Materialize only if profiling evidence demands it in a subsequent EXEC-SPEC." That rejection removes the only scenario where the outbox would be relevant to PRD-090's projection layer.

**Post-Wave-2 implication:** If a future slice persists `TableInventoryAccountingProjection` (requiring a projection store), that slice would need: (a) a new `event_type` registration (e.g. `table.result.derived`), (b) an outbox consumer processing that event_type, and (c) a possible `category` discriminator extension to the outbox schema (the Wave 2 UL already anticipates this: "A future outbox row schema may add an explicit `category` discriminator: `'authority_fact' | 'telemetry_fact' | 'dependency_event'`"). This belongs in the post-Wave-2 backlog, not PRD-090.

---

**Q4 — Does `custody_status: 'non_custody_estimate'` conflict with or require extension of `origin_label` / `fact_class`?**

**NOT REQUIRED.** They operate at different semantic layers and are mutually consistent.

`origin_label` (`'actual'` / `'estimated'`) is an **immutable fact-authoring label** set at the authoring boundary and carried unchanged through the outbox to every consumer. It describes the authority class of the sourced fact.

`custody_status: 'non_custody_estimate'` is a **projection-layer authority envelope** describing the quality of the *derived result*, not the sourced facts. It answers: "Is this result custody-authoritative?" — to which PRD-090 always answers "No" in this slice because no count-room or cage-handoff custody inputs exist.

These answer different questions about different things at different layers. There is no conflict.

One conformance note for EXEC: the `TableInventoryAccountingProjection` DTO's authority envelope (`custody_status`, `source_authority`) serves the same purpose as the Wave 2 surface rendering contract's `{type, source, completeness}` envelope — but uses TIA-domain vocabulary instead of the generic Wave 2 form. Before the Rundown surface ships, the EXEC team should confirm that the rendered values carry the Wave 2 `FinancialValue`-compatible completeness signal at the API boundary. The mapping is:

| PRD-090 DTO field                                              | Wave 2 surface contract equivalent |
| -------------------------------------------------------------- | ---------------------------------- |
| `custody_status: 'non_custody_estimate'`                       | `type: 'estimated'`                |
| `source_authority.drop` / `.snapshots` / `.fills` / `.credits` | `source` (qualified per input)     |
| `completeness.status`                                          | `completeness.status`              |

This mapping is a WS3 API boundary conformance check, not an outbox change. The outbox schema requires no extension.

---

**Q5 — Any semantic alignment work the outbox team must do before or alongside PRD-090 EXEC?**

**NOT REQUIRED. Zero outbox team action items.**

PRD-090 EXEC is entirely decoupled from the outbox team's current work (Phase 2.5 sign-off and post-Wave-2 backlog). The reasons:

1. PRD-090 reads source tables, not outbox relay outputs.
2. All consumed input paths are already authored and outbox-wired (Phases 2.0–2.2).
3. No new producers, consumers, event_types, or DDL changes are in scope.
4. The projection artifact classification imposes no outbox obligations in a read-time, stateless derivation.
5. `custody_status` is a projection-layer concern fully within PRD-090's own DTO contract.

The Wave 2 team's only touchpoint is confirmatory: the source tables (`table_buyin_telemetry`, `table_fill`, `table_credit`) that PRD-090 reads are stable and queryable — which the outbox posture checks (OUTBOX-CHECK-001 through 004) already returned ACCEPTABLE.

---

**Summary**

| Question                                    | Verdict                                                 | Action                                                                                            |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Q1 — Discriminator field conflict           | NOT REQUIRED                                            | None                                                                                              |
| Q2 — Event catalog amendments               | NOT REQUIRED                                            | None                                                                                              |
| Q3 — Projection Artifact outbox obligations | NOT REQUIRED (deferred to future persisted-store slice) | Post-Wave-2 backlog item if store ever materializes                                               |
| Q4 — `custody_status` taxonomy conflict     | NOT REQUIRED                                            | WS3 EXEC conformance check only: confirm `FinancialValue`-compatible completeness at API boundary |
| Q5 — Outbox team actions before EXEC        | NOT REQUIRED                                            | None                                                                                              |

**The outbox and PRD-090 are fully decoupled for this slice.** The only forward-looking note is that `custody_status` should be verified to render a Wave 2-compatible completeness signal at the WS3 API boundary — but that is a surface rendering conformance check in the EXEC-SPEC, not an outbox schema change.