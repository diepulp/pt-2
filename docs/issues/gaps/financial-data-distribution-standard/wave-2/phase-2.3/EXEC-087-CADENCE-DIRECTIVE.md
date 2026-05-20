## EXEC-087 Cadence Alteration Directive — Vertical Collapse Enforcement

EXEC-087 remains authorized, but its execution cadence is altered to prevent Phase 2.3 from expanding into Phase 2.4 under the weight of newly surfaced coupling.

### Directive

Phase 2.3 must proceed as a **vertically collapsed Class A completeness proof**, not as a broad projection-platform rollout.

The executable proof path is:

```text
Class A outbox event
→ ledger-only relay claim
→ idempotent Class A projection
→ gaming-day lifecycle signal
→ financial-summary / modal completeness update

All implementation work must either:

directly support this Class A completeness path, or
protect future Phase 2.4 replay by preserving non-ledger rows unprocessed.

Anything outside those two purposes is out of cadence for EXEC-087.

Cadence Adjustment

Split execution mentally into two gates, even if kept inside the same EXEC:

Gate A — Envelope Compatibility Gate

Complete before consumer activation:

add finance_outbox.gaming_day,
update fn_finance_outbox_emit,
update all existing producers only to remain compatible with the required envelope column,
harden gaming_day NOT NULL,
update immutability protection,
prove every current producer emits non-null gaming_day.

This gate is not operational telemetry implementation. It is shared-table compatibility required by the new envelope contract.

Gate B — Class A Consumer Proof Gate

Proceed only after Gate A passes:

create visit_class_a_projection,
implement rpc_process_class_a_projection(p_message_id),
claim only fact_class = 'ledger',
preserve non-ledger rows with processed_at IS NULL,
wire lifecycle-aware completeness into financial-summary and modal-data,
verify I3 / I4 against Class A only.
Explicit Containment Rule

EXEC-087 may not:

consume grind.observed,
consume fill.recorded,
consume credit.recorded,
build operational telemetry projections,
declare mixed-source financial surfaces complete,
introduce replay UI,
introduce operator-facing gaming-day close UI,
or implement Phase 2.4 completeness semantics.

If non-Class-A contributors affect a rendered financial surface, Phase 2.3 must conservatively return partial until Phase 2.4 owns that projection path.

Cadence Principle

Do not interpret newly surfaced coupling as permission to widen the slice.

Treat it as proof that the shared outbox envelope must be stabilized before the first real consumer runs.

The Phase 2.3 success condition is narrow:

one Class A event stream produces one lifecycle-aware completeness signal without damaging Phase 2.4 inputs.

That is the vertical collapse boundary for EXEC-087.