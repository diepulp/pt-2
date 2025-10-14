# Wave 2 Documentation Guide

**Last Updated**: 2025-10-13
**Status**: Hardened for production

---

## Document Hierarchy (Canonical Order)

### 1. **WAVE_2_SIMPLIFIED_WORKFLOW.md** ⭐ **START HERE**
**Purpose**: Canonical execution plan for Wave 2 implementation

**Use this for**:
- Day-to-day development tasks
- Exit criteria verification
- Timeline estimation (6-7h)
- Quality gates and checklists

**Contents**:
- Track 0: Loyalty service integration (schema hardening, actions, rate limiting)
- Track 1: RatingSlip orchestration (actions with recovery, tests)
- 8 integration tests (including saga recovery, concurrency, idempotency)
- Extension path documentation

**Audience**: Developers, QA engineers

---

### 2. **WAVE_2_HARDENED_FIXES.md** 📚 **TECHNICAL REFERENCE**
**Purpose**: Deep-dive technical specification for production hardening

**Use this for**:
- Understanding WHY each fix is required
- Code examples for atomicity, idempotency, correlation tracing
- Operational runbook (failure recovery procedures)
- Troubleshooting production issues

**Contents**:
- 6 critical gap analyses (atomicity, idempotency, RPC, correlation, security, concurrency)
- Full code implementations with comments
- Schema migration details
- Test specifications (saga, concurrency, edge cases)
- Recovery procedures for partial completions

**Audience**: Architects, senior developers, security reviewers

---

### 3. **WAVE_2_HARDENING_SUMMARY.md** 📊 **EXECUTIVE OVERVIEW**
**Purpose**: High-level justification and risk assessment

**Use this for**:
- Go/no-go decision making
- Timeline impact analysis (6-7h vs 4-5h risky vs 13-15h over-engineered)
- Risk reduction verification (HIGH → LOW)
- Stakeholder communication

**Contents**:
- Executive summary of 6 critical fixes
- Risk assessment matrix (before/after)
- Cost-benefit analysis (+2h investment = 10x post-launch savings)
- Implementation checklist
- Success metrics

**Audience**: Tech leads, product managers, stakeholders

---

## Archived Documents

### `WAVE_2_EVENT_API_WORKFLOW.md.ARCHIVED_OVERENGINEERED`
**Status**: ⚠️ OBSOLETE - Do not use

**Reason for archival**: Over-engineered with generic event bus, dispatcher factories, Redis rate limiting, and event log table—all unnecessary for current scale (single producer/consumer, ~100 concurrent sessions).

**Historical value**: Reference for future multi-consumer event system design (when Analytics/Marketing need telemetry).

---

## Decision Trail

### Phase 1: Original Plan (Over-Engineered)
- **Document**: `WAVE_2_EVENT_API_WORKFLOW.md` (archived)
- **Approach**: Generic event bus + dispatcher + Redis + event log
- **Timeline**: 13-15h
- **Verdict**: ⚠️ Premature optimization for single consumer

### Phase 2: Simplification (Security Gap)
- **Analysis**: `wave-2-adjustment.md` identified over-engineering
- **Approach**: Direct service calls, in-memory rate limiter
- **Timeline**: 4-5h
- **Verdict**: ⚠️ Too lean—introduced 6 critical production risks

### Phase 3: Hardened Simplification (Balanced) ✅
- **Document**: `WAVE_2_SIMPLIFIED_WORKFLOW.md` (canonical)
- **Approach**: Direct calls + recovery + correlation + deterministic idempotency
- **Timeline**: 6-7h
- **Verdict**: ✅ Production-ready—40% complexity reduction, LOW risk

---

## Quick Start

### For Developers Starting Wave 2:
1. Read `WAVE_2_SIMPLIFIED_WORKFLOW.md` sections 1-5 (scope, dependencies, timeline, tasks)
2. Reference `WAVE_2_HARDENED_FIXES.md` when implementing atomicity/idempotency
3. Use `WAVE_2_HARDENING_SUMMARY.md` to explain timeline to stakeholders

### For Reviewers:
1. Start with `WAVE_2_HARDENING_SUMMARY.md` (risk assessment)
2. Deep-dive `WAVE_2_HARDENED_FIXES.md` for critical fixes
3. Validate against `WAVE_2_SIMPLIFIED_WORKFLOW.md` exit criteria

### For Future Reference:
- **Extension path**: See `WAVE_2_SIMPLIFIED_WORKFLOW.md` section 9
- **Operational runbook**: See `WAVE_2_HARDENED_FIXES.md` section 6
- **Event bus design**: See archived `WAVE_2_EVENT_API_WORKFLOW.md.ARCHIVED_OVERENGINEERED`

---

## Key Principles (From All Documents)

1. **Direct Service Invocation**: RatingSlip → Loyalty via server action (no event bus until >1 consumer)
2. **Compensating Transactions**: Recovery action for partial failures (slip closed, loyalty pending)
3. **Deterministic Idempotency**: `rating_slip_id` for gameplay, hashed date-bucketed keys for manual rewards
4. **Correlation Tracing**: Thread correlation IDs through all operations for observability
5. **Audit First**: Store before/after values in ledger for verification
6. **Fail Explicit**: Return `PARTIAL_COMPLETION` with recovery metadata vs silent failure

---

## Contact & Ownership

- **Document Maintainer**: Phase 6 Working Group
- **Technical Owner**: Backend Architect + TypeScript Pro
- **Approval Status**: ✅ Unanimous approval (3 specialized agents)
- **Last Review**: 2025-10-13

---

**Remember**: Start with `WAVE_2_SIMPLIFIED_WORKFLOW.md` for implementation, reference others as needed for context.
