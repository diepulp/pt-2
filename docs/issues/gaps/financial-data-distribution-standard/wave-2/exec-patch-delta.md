EXEC-080 — Containment Patch Delta
1. Kill Discovery Expansion (WS5 + any grep clauses)
🔧 Replace in WS5 (and anywhere similar appears)
During implementation, grep may be used to detect additional callsites.

If additional callsites are discovered:
- DO NOT update them within this PRD
- DO NOT expand the workstream scope
- Record them in `POST-WAVE-2-SURFACE-DEBT.md`
- Proceed with implementation using only inventory-defined callsites

This PRD is a closure slice, not a discovery phase.
2. Remove “Fix-if-found” Compliance Behavior (WS4)
🔧 Replace this intent:

“confirm no component co-aggregates…”

With:
Compliance isolation verification is observational only.

If co-aggregation of `type: 'compliance'` and `type: 'actual'` values is discovered:
- DO NOT fix within this PRD
- Record as violation in `COMPLIANCE-ISOLATION-VIOLATIONS.md`
- Escalate to a dedicated post-Wave-2 remediation slice

No UI restructuring or aggregation changes are in scope.
3. Lock Completeness Derivation Source (WS3)
🔧 Add under WS3 completeness logic
Completeness override MUST derive from `visit.status` only.

Rules:
- The modal-data route may access slip state only as a proxy for visit lifecycle.
- Slip status MUST NOT be treated as an independent lifecycle authority.
- No derivation from timestamps, transaction counts, or UI state.

Any ambiguity must resolve to `'unknown'`, not inferred states.
4. Constrain UI Scope (WS3b)
🔧 Add under WS3b invariants
UI updates are strictly limited to the named consumer callsites in this workstream.

- No shared component refactors are allowed
- No global formatting utilities may be introduced or modified
- No additional render sites may be updated even if discovered

Any additional usage of affected fields must be deferred and recorded for a separate slice.
5. Constrain Test Scope (WS6)
🔧 Replace compliance test requirement section
Compliance isolation test must be minimal and non-expansive:

- Assert that compliance-class fields emit `type: 'compliance'`
- Assert they are not labeled or treated as `actual`

The test MUST NOT:
- introduce shared validation utilities
- attempt arithmetic validation across types
- introduce abstraction layers or helpers

This is a guardrail, not a validation framework.
6. Add Global “No Expansion” Rule (top-level, after Overview)
### Scope Containment Rule

This EXEC-SPEC is a bounded closure slice.

The following are strictly prohibited during execution:

- expanding field scope beyond the 12 enumerated fields
- modifying additional DTOs, routes, or consumers not listed in WS outputs
- performing opportunistic refactors (UI, service, or schema)
- introducing shared abstractions or utilities not required for direct completion
- fixing adjacent or discovered issues outside defined scope

If additional issues or callsites are discovered:
- they must be recorded
- they must NOT be addressed within this PRD

Violation of this rule constitutes scope breach.
7. Add Logging Boundary Protection (DoD or Transport section)
All FinancialValue emissions must include complete structure:

- `value`
- `type`
- `source`
- `completeness.status`

This applies to:
- API responses
- DTOs
- logs and debug outputs

No partial FinancialValue objects are permitted at any boundary.
Net Effect

After this patch:

❌ No mid-flight scope expansion
❌ No “while we’re here” fixes
❌ No accidental UI/system refactors
❌ No creeping compliance redesign
✅ Fully sealed execution slice
✅ Deterministic workstreams
✅ Wave 2 remains cleanly separated