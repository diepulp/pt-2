---
name: feature-pipeline
description: Linear feature development pipeline with explicit boundaries and executable gates. Prevents scope creep by enforcing SRM-first ownership, Feature Boundary Statements, SEC notes, ADR freeze, and CI-testable DoD gates. Orchestrates prd-writer, lead-architect, and prd-pipeline skills.
---

# Feature Development Pipeline

**Purpose:** Stop "requirements entropy" and endless ADR iterations by forcing bounded scope + measurable gates.

**Core Principle:** A feature is *done* when:
1. Its **bounded context** is explicit (what's in/out)
2. Its **gates** are executable (how we prove it's done)

Docs don't end a feature. **Gates do.**

---

## Quick Start

```
/feature-start player-identity-enrollment
```

This initiates the 7-phase linear pipeline with gates at each transition.

---

## Pipeline Phases

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase 0: SRM Check         → Ownership sentence                │
│     ↓ GATE: srm-ownership                                       │
│  Phase 1: Feature Brief     → 1-page scope + non-goals          │
│     ↓ GATE: brief-approved                                      │
│  Phase 2: PRD               → Behavior + acceptance criteria    │
│     ↓ GATE: prd-approved                                        │
│  Phase 3: SEC Note          → Assets/threats/controls           │
│     ↓ GATE: sec-approved                                        │
│  Phase 4: ADR (if needed)   → Durable decisions ONLY            │
│     ↓ GATE: adr-frozen                                          │
│  Phase 5: EXEC-SPEC + DoD   → Implementation + executable gates │
│     ↓ GATE: dod-executable                                      │
│  Phase 6: Execute           → Workstream implementation         │
│     ↓ GATE: implementation-complete                             │
│  DONE                                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: SRM-First Ownership Contract

**Input:** Feature name/description
**Output:** Single ownership sentence

> "This feature belongs to **{OwnerService}** and may only touch **{Writes}**; cross-context needs go through **{Contracts}**."

**Gate:** `srm-ownership` — If you can't write this sentence, you're not ready to design.

**Workflow:**
1. Load SRM (`docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`)
2. Identify owning bounded context(s)
3. List writes (tables/RPCs) and reads
4. Identify cross-context contracts (DTOs/RPCs)
5. Write ownership sentence

---

## Phase 1: Feature Brief (1 Page)

**Goal:** Prevent scope creep by declaring intent + non-goals up front.
**Rule:** No implementation detail here.

**Template:** See `references/feature-brief-template.md`

**Must Include:**
- **Goal:** What outcome exists after shipping that did not exist before
- **Primary Actor:** Role/persona who triggers the feature
- **Primary Scenario:** One sentence
- **Non-Goals:** 5+ explicit exclusions (the anti-scope)
- **Bounded Context:** Owner + writes/reads + cross-context contracts
- **Success Metric:** One measurable outcome

**Gate:** `brief-approved` — If you can't list non-goals, you're about to overbuild.

---

## Phase 2: PRD

**Goal:** Define the *what* with testable statements.
**Rule:** PRD ends in DoD-friendly acceptance criteria.

**Delegation:** Invoke `prd-writer` skill

**Must Include:**
- User flows (happy path + 2-3 critical unhappy paths)
- Acceptance criteria as verifiable statements
- Out of scope (reiterated)
- Data classification (PII / financial / compliance / operational)

**Acceptance Criteria Format (DoD-Ready):**
- "Dealer cannot view player identity fields."
- "Enrollment requires casino scoping and records `enrolled_by`."
- "Duplicate document hash returns a deterministic error code."

**Gate:** `prd-approved` — If it can't be proven by a test, it's not a criterion.

---

## Phase 3: SEC Note (Tiny Threat Model)

**Goal:** Prevent "security later" from becoming "security never."
**Rule:** Small and explicit beats broad and vague.

**Template:** See `references/sec-note-template.md`

**Must Include:**
- **Assets:** What must be protected (PII, identity docs, player list, etc.)
- **Threats:** Enumeration, spoofed audit, cross-casino leakage, privilege creep
- **Controls:** RLS rules, actor binding, hashing/encryption stance, rate limits
- **Deferred Risks:** Explicitly allowed risks for MVP (and why)

**Gate:** `sec-approved` — If you store sensitive values, you must justify storage form.

---

## Phase 4: ADR (Only for Durable Decisions)

**Goal:** Capture decisions that are hard to reverse or reused widely.
**Rule:** ADR ≠ diary. ADR is for **durable** architecture decisions.

**Delegation:** Invoke `lead-architect` skill

**ADR-Worthy Examples:**
- "Identity stored as hash + last4 (no plaintext doc number)."
- "Enrollment gating uses EXISTS + role gate (not role-only)."
- "Actor binding uses `app.actor_id` session var + DB enforcement."

**What Goes in ADR:**
- Context, Decision, Consequences
- Security invariants (INV-1, INV-2, etc.)
- Bounded context ownership
- Access control matrix
- Alternatives considered

**What Does NOT Go in ADR:**
- RLS policy SQL (→ EXEC-SPEC)
- Trigger bodies (→ EXEC-SPEC)
- Index definitions (→ EXEC-SPEC)
- Migration steps (→ EXEC-SPEC)

**Gate:** `adr-frozen` — If it can change next sprint with low fallout, it's not an ADR.

---

## Phase 5: EXEC-SPEC + DoD Gate Checklist

**Goal:** Convert PRD criteria into concrete implementation + enforce closure.
**Rule:** Every criterion maps to a place in code.

**Outputs:**
1. **EXEC-SPEC** — Implementation details (mutable)
2. **DoD Gate Checklist** — Executable CI gates

**Template:** See `references/dod-gate-template.md`

**EXEC-SPEC Must Include:**
- Schema/migrations (tables, indexes, constraints, triggers)
- RLS policies (USING/WITH CHECK; role matrix enforcement)
- APIs/RPCs (inputs/outputs, error codes, idempotency keys)
- UI changes (form states, error mapping, loading/empty states)
- Migration/backfill (even if "none" — state it)

**DoD Gate Checklist Format:**

```yaml
gates:
  functional:
    A1_schema_exists:
      assertion: "player_identity table exists with correct columns"
      test_file: "__tests__/schema/player-identity.test.ts"
      ci_command: "npm test -- -t 'schema'"

  security:
    B1_dealer_cannot_read:
      assertion: "SELECT as dealer → 0 rows"
      test_file: "__tests__/rls/player-identity.test.ts"
      ci_command: "npm test -- -t 'dealer CANNOT read'"
      critical: true  # Blocks deployment

  integrity:
    C1_fk_enforced:
      assertion: "INSERT without enrollment → FK error"
      test_file: "__tests__/constraints/player-identity.test.ts"
      ci_command: "npm test -- -t 'enrollment prerequisite'"
```

**Gate:** `dod-executable` — Every acceptance criterion maps to migration/policy/test/handler/UI state.

---

## Phase 6: Execute

**Goal:** Implement the feature via workstreams.
**Delegation:** Invoke `prd-pipeline` skill via `/prd-execute`

**Workflow:**
1. prd-pipeline parses EXEC-SPEC
2. Spawns capability agents for workstreams
3. Runs validation gates (type-check, lint, test-pass)
4. Updates MVP progress

**Gate:** `implementation-complete` — All DoD gates pass in CI.

---

## Definition of Done (Feature Complete)

A feature is "Done" when all buckets are green:

### A) Functional Gates
- [ ] PRD acceptance criteria pass
- [ ] Happy path + critical unhappy paths validated

### B) Security Gates
- [ ] Role matrix proven by automated tests (allow + deny)
- [ ] No cross-casino reads/writes possible
- [ ] Actor binding enforced in DB (not "trusted from client")

### C) Data Integrity Gates
- [ ] Uniqueness/immutability enforced (constraints/triggers)
- [ ] Concurrency/race behavior defined and tested

### D) Operability Gates
- [ ] Errors are typed/actionable (no raw SQL leakage to UI)
- [ ] Minimal audit is consistent (or explicitly omitted)
- [ ] Migration rollback story exists (or blast radius is isolated)

**Gate:** `all-gates-pass` — If you can't run it in CI, it's not DoD.

---

## State Management

### Checkpoint Structure

```json
{
  "feature_id": "player-identity-enrollment",
  "current_phase": 3,
  "status": "in_progress",
  "gates_passed": ["srm-ownership", "brief-approved", "prd-approved"],
  "gates_pending": ["sec-approved", "adr-frozen", "dod-executable", "implementation-complete"],
  "artifacts": {
    "feature_boundary": "docs/20-architecture/specs/ADR-022/FEATURE_BOUNDARY.md",
    "feature_brief": "docs/20-architecture/specs/ADR-022/FEATURE_BRIEF.md",
    "prd": "docs/10-prd/PRD-022.md",
    "sec_note": null,
    "adr": null,
    "exec_spec": null,
    "dod_gates": null
  },
  "timestamp": "2025-12-24T10:00:00Z"
}
```

**Location:** `.claude/skills/feature-pipeline/checkpoints/{feature-id}.json`

---

## Slash Commands

| Command | Purpose |
|---------|---------|
| `/feature-start <name>` | Start new feature pipeline at Phase 0 |
| `/feature-status` | Show current phase, gates passed/pending |
| `/feature-resume` | Resume from last checkpoint |
| `/feature-freeze-adr <adr-id>` | Refactor ADR into Decision + EXEC-SPEC + DoD |

---

## Integration with Existing Skills

| Phase | Delegates To | How |
|-------|--------------|-----|
| Phase 2 (PRD) | `prd-writer` | Skill invocation with Feature Boundary context |
| Phase 4 (ADR) | `lead-architect` | Skill invocation, then freeze operation |
| Phase 6 (Execute) | `prd-pipeline` | `/prd-execute` with EXEC-SPEC |

---

## Why Features "Never End" (The Anti-Pattern)

**Bad Loop:**
"Design → discover edge case → redesign → discover deeper edge case → redesign…"

**Good Loop:**
"Define boundary + gates → implement → prove gates → ship → iterate."

Edge cases don't stop existing. You stop letting them expand the scope.

---

## Resources

| File | Purpose |
|------|---------|
| `references/feature-brief-template.md` | Phase 1 template |
| `references/feature-boundary-template.md` | Ownership + scope template |
| `references/sec-note-template.md` | Phase 3 template |
| `references/dod-gate-template.md` | Phase 5 DoD template |
| `references/phase-protocol.md` | Gate approval UX |

---

## Examples

### ADR Freeze Operation

When an ADR is carrying implementation detail:

```
/feature-freeze-adr ADR-022

Result:
  ADR-022_*.md → ADR-022_DECISIONS.md (frozen, durable decisions only)
  + EXEC-SPEC-022.md (implementation details, mutable)
  + DOD-022.md (executable gate checklist)
```

### Feature Start

```
/feature-start player-identity-enrollment

Phase 0: SRM-First Ownership
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Loading SRM...

This feature belongs to **PlayerService** (identity artifacts) and
**CasinoService** (enrollment relationship). PlayerService writes to
`player`, `player_identity`; CasinoService writes to `player_casino`.
Cross-context needs go through **PlayerEnrollmentDTO**.

Gate: srm-ownership
Is this ownership correct? [y/n/edit]
```
