# SEC-NOTE PATCH DELTA — Transactional Outbox Audit Corrections

## DEF-1 — Correct T1 Mitigation Contradiction

Replace wording similar to:

> relay reads with explicit `casino_id` filter

with:

> Relay operates under service-role access and intentionally processes all casino-scoped rows.
> Cross-casino isolation is enforced at the authoring/RPC boundary and at downstream projection
> ownership boundaries, not via relay-level filtering.

Rationale:
- The relay is an internal transport mechanism, not a tenant-facing read path.
- The RFC relay query does not filter by `casino_id`.
- Isolation is guaranteed at producer boundaries and downstream ownership semantics.

---

## DEF-2 — Tone Down T2 Exfiltration Overstatement

Replace wording similar to:

> potential data exfiltration via crafted consumer targeting

with:

> Unauthorized relay invocation could force replay processing, trigger unnecessary relay load,
> or accelerate delivery attempts outside expected scheduler cadence.

Clarify:
- The relay does not dynamically target arbitrary consumers.
- The topology is bounded and internal.
- The realistic risk is operational abuse, not arbitrary exfiltration routing.

---

## DEF-3 — Expand T4 to Include Semantic Corruption

Add refinement to T4:

> Threat also includes semantically invalid outbox rows authored through legitimate RPC paths due
> to incorrect event classification, malformed payload construction, or parity violations.

Clarify:
- Semantic corruption is a more realistic pilot threat than raw unauthorized insertion.
- Legitimate RPCs can still produce invalid transport semantics if parity discipline drifts.

---

## DEF-4 — Harden T6 Against Projection Coupling

Add under T6 and/or C6:

> Relay lifecycle metadata MUST NOT be used to derive financial completeness,
> settlement confidence, or projection authority.

Clarify:
- `processed_at` is relay lifecycle state only.
- `delivery_attempts` and `last_error` are transport diagnostics only.
- Relay metadata is never financial truth.

---

## DEF-5 — Add Replay Abuse Acknowledgment

Add to Deferred Risks:

| Risk | Reason for Deferral | Trigger to Address |
|---|---|---|
| Replay amplification / replay exhaustion attacks | Pilot topology is bounded and relay invocation is authenticated; no external replay API exists | Before introducing multi-consumer replay tooling or external replay controls |

Clarify:
- Replay is intentionally internal-only in Wave 2.
- No replay orchestration surface exists at pilot scale.

---

## DEF-6 — Tighten `player_id` Sensitivity Wording

Replace wording similar to:

> not a sensitive field in isolation

with:

> UUID reference only; sensitivity derives primarily from linkage to financial-event context rather
> than from the identifier value itself.

Clarify:
- The UUID is opaque.
- Sensitivity emerges from contextual linkage to financial telemetry and replay history.

