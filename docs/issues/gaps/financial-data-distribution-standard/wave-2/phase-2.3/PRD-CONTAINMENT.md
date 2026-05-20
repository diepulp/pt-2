# PRD-087 — Wave 2 Phase 2.3: Class A Lifecycle Completeness Proof

## Purpose
Prove that one ledger-authoritative Class A outbox stream can update one visit-level projection and produce a lifecycle-aware completeness signal without consuming or damaging Phase 2.4 operational inputs.

## Non-Goals
- No operational telemetry projection.
- No grind/fill/credit consumption.
- No mixed-source surface completion.
- No replay UI.
- No operator-facing gaming-day close UI.
- No reconciliation or authoritative totals.

## Gate A — Envelope Compatibility
- Add `finance_outbox.gaming_day`.
- Amend all existing producers to emit non-null `gaming_day`.
- Prove producer compatibility.
- Harden `gaming_day NOT NULL`.
- Protect `gaming_day` in immutability guard.
- Preserve non-ledger rows for future Phase 2.4.

## Gate A Required Proofs
- PFT amount unit proven.
- Producer execution posture proven.
- All producer event paths emit non-null `gaming_day`.
- No old helper signature remains.
- No authenticated write path broken.

## Gate B — Class A Projection Proof
- Create Class A projection store.
- Process only `fact_class = 'ledger'`.
- Consumer derives projection fields from immutable outbox + PFT provenance.
- Idempotency fence and projection update commit atomically.
- Lifecycle close signal enables `partial` / `complete`.
- Mixed-source surfaces remain `partial`.

## Gate B Required Proofs
- No 100x amount corruption.
- Duplicate delivery does not double-project.
- Replay produces same projection.
- Non-ledger rows remain unprocessed.
- Closed gaming day + empty Class A backlog = complete only for Class A-only surfaces.