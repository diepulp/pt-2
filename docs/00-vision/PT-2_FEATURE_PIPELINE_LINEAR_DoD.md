# PT-2 Feature Development Pipeline (Linear Path to Definition of Done)

**Purpose:** Stop “requirements entropy” and endless ADR iterations by forcing a bounded scope + measurable gates.  
**Use:** Copy this doc into `docs/20-architecture/workflow/` (or your preferred governance location) and treat it as the standard for any production-bound feature.

---

## Core idea

A feature is *done* when:
1) its **bounded context** is explicit (what’s in/out), and  
2) its **gates** are executable (how we prove it’s done).

Docs don’t end a feature. **Gates do.**

---

## Workflow overview (the linear path)

### 0) SRM-first: ownership contract

**Input:** SRM v4 (canonical bounded-context contract).  
**Output (required):** a single ownership sentence:

> “This feature belongs to **{OwnerService}** and may only touch **{Writes}**; cross-context needs go through **{Contracts}**.”

**Gate:** If you can’t write this sentence, you’re not ready to design.

---

### 1) Feature Brief (1 page)

**Goal:** prevent scope creep by declaring intent + non-goals up front.  
**Rule:** No implementation detail here.

**Must include:**
- **Goal:** what outcome exists after shipping that did not exist before
- **Primary actor:** role/persona who triggers the feature
- **Primary scenario:** one sentence
- **Non-goals:** 5+ explicit exclusions (the anti-scope)
- **Bounded context:** owner + writes/reads + cross-context contracts
- **Success metric:** one measurable outcome

**Gate:** If you can’t list non-goals, you’re about to overbuild.

---

### 2) PRD (behavior + acceptance criteria)

**Goal:** define the *what* with testable statements.  
**Rule:** PRD ends in DoD-friendly acceptance criteria.

**Must include:**
- **User flows:** happy path + 2–3 critical unhappy paths
- **Acceptance criteria:** written as verifiable statements
- **Out of scope:** reiterated (yes, again)
- **Data classification:** PII / financial / compliance / operational

**Acceptance criteria format (DoD-ready):**
- “Dealer cannot view player identity fields.”
- “Enrollment requires casino scoping and records `enrolled_by`.”
- “Duplicate document hash returns a deterministic error code.”

**Gate:** If it can’t be proven by a test, it’s not a criterion.

---

### 3) SEC note (tiny threat model + risk boundaries)

**Goal:** prevent “security later” from becoming “security never.”  
**Rule:** Small and explicit beats broad and vague.

**Template:**
- **Assets:** what must be protected (PII, identity docs, player list, etc.)
- **Threats:** enumeration, spoofed audit, cross-casino leakage, privilege creep
- **Controls:** RLS rules, actor binding, hashing/encryption stance, rate limits
- **Deferred risks:** explicitly allowed risks for MVP (and why)

**Gate:** If you store sensitive values, you must justify storage form (plaintext vs hash vs encrypted).

---

### 4) ADR (only for durable decisions)

**Goal:** capture decisions that are hard to reverse or reused widely.  
**Rule:** ADR ≠ diary. ADR is for **durable** architecture decisions.

**Examples that *are* ADR-worthy:**
- “Identity stored as hash + last4 (no plaintext doc number).”
- “Enrollment gating uses EXISTS + role gate (not role-only).”
- “Actor binding uses `app.actor_id` session var + DB enforcement.”

**Gate:** If it can change next sprint with low fallout, it’s not an ADR.

---

### 5) Execution Spec (how it will be built)

**Goal:** convert PRD criteria into concrete implementation + enforce closure.  
**Rule:** Every criterion maps to a place in code.

**Must include:**
- **Schema/migrations:** tables, indexes, constraints, triggers
- **RLS policies:** USING/WITH CHECK; role matrix enforcement
- **APIs/RPCs:** inputs/outputs, error codes, idempotency keys
- **UI changes:** form states, error mapping, loading/empty states
- **Migration/backfill:** even if “none” (state it)

**Gate:** Every acceptance criterion maps to **migration / policy / test / handler / UI state**.

---

### 6) Definition of Done (DoD: executable gates)

**Goal:** end the feature with measurable proof.  
**Rule:** DoD is a *gate checklist*, not a feeling.

A feature is “Done” when all buckets are green:

#### A) Functional gates
- PRD acceptance criteria pass
- Happy path + critical unhappy paths validated

#### B) Security gates
- Role matrix proven by automated tests (allow + deny)
- No cross-casino reads/writes possible
- Actor binding enforced in DB (not “trusted from client”)

#### C) Data integrity gates
- Uniqueness/immutability enforced (constraints/triggers)
- Concurrency/race behavior defined and tested

#### D) Operability gates
- Errors are typed/actionable (no raw SQL leakage to UI)
- Minimal audit is consistent (or explicitly omitted)
- Migration rollback story exists (or blast radius is isolated)

**Gate:** If you can’t run it in CI, it’s not DoD.

---

## The Feature Boundary Statement (copy/paste template)

> Use this at the top of every Feature Brief / PRD / Execution Spec.

```md
## Feature Boundary Statement

- **Owner service:** {OwnerService}
- **Writes:** {tables / RPCs / events}
- **Reads:** {tables / RPCs / events}
- **Cross-context contracts:** {DTO / RPC / event names}
- **Non-goals (top 5):**
  1. ...
  2. ...
  3. ...
  4. ...
  5. ...
- **DoD gates:** Functional / Security / Integrity / Operability (see DoD section)
```

---

## Why features “never end” (the anti-pattern)

**Bad loop:**  
“Design → discover edge case → redesign → discover deeper edge case → redesign…”

**Good loop:**  
“Define boundary + gates → implement → prove gates → ship → iterate.”

Edge cases don’t stop existing. You stop letting them expand the scope.

---

## Minimal implementation checklist (quick start)

When starting any feature intended for production:

1) Write the **Feature Boundary Statement**  
2) Produce Feature Brief (1 page)  
3) Write PRD acceptance criteria (8–12 statements)  
4) Add SEC note (assets/threats/controls/deferred)  
5) Only then: ADRs (if durable decisions exist)  
6) Write Execution Spec mapping each criterion → code + tests  
7) Implement + CI tests = DoD buckets green  
8) Ship

---

## Notes (PT-2-specific reminders)

- **SRM is canonical** (matrix-first; schema must mirror SRM).
- **No cross-context table reads/writes** except via explicit contracts.
- Prefer DB-enforced guarantees for: actor binding, immutability, uniqueness.
- Treat RLS + pooling context setting as **part of the security surface**.
