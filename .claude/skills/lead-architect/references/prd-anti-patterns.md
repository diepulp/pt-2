# PRD Anti-Patterns

Recognize and avoid these common PRD mistakes.

## 1. "Everything PRD"

**Smell:** PRD scope reads like the whole system — multiple bounded contexts, all cross-cutting concerns, all future phases.

**Impact:** No realistic initial release feels legitimate; everything looks incomplete.

**Detection signals:**
- PRD mentions more than 3 bounded contexts
- Scope includes "and also..." repeatedly
- Goals span multiple phases
- No clear "out of scope" section

**How to avoid:**
- Limit PRD scope to one release / phase / problem area
- Explicitly mark other domains as **out of scope** or "future PRDs"
- If scope feels like "the whole system," split into multiple PRDs

---

## 2. Architecture Spec Crammed into PRD

**Smell:** Detailed sections on service layout, transport decisions, folder structure, class diagrams.

**Impact:** Implementation choices feel frozen; changing them looks like "breaking the PRD". The doc becomes heavy and hard to maintain.

**Detection signals:**
- Sections titled "Service Architecture" or "Technical Design"
- Class diagrams or sequence diagrams embedded
- Database schema details inline
- Specific technology choices mandated

**How to avoid:**
- Move architecture detail to separate **ARCH** docs
- Leave only 2–3 high-level bullets in the PRD
- Add a link to canonical ARCH file instead

---

## 3. QA / Testing Standard in PRD

**Smell:** TDD rituals, coverage numbers, test tool configurations, full testing pyramid, detailed RLS test matrices inside the PRD.

**Impact:** The bar for "done" becomes unattainable early on; shipping a thin walking skeleton feels impossible.

**Detection signals:**
- Specific coverage percentages (e.g., "90% coverage")
- Test tool configurations (Jest, Vitest setup)
- Detailed test matrices
- CI/CD pipeline specifications

**How to avoid:**
- Keep QA guidance in dedicated **QA-0xx** documents
- In PRD DoD, require only minimal testing commitments appropriate to the phase
- Reference QA standards, don't embed them

---

## 4. Manual Traceability Matrix in PRD

**Smell:** Long tables mapping every user story to every service, table, RPC, and test, maintained by hand inside the PRD.

**Impact:** Changing anything in the system requires tedious updates; the PRD becomes brittle and discourages iteration.

**Detection signals:**
- Large tables with columns: Story | Service | Table | RPC | Test
- Hand-maintained cross-references
- "Keep in sync with..." warnings

**How to avoid:**
- Keep traceability in a separate doc or generate it
- In the PRD, keep only a small table mapping **key stories to features**

---

## 5. Vague Goals / No Success Criteria

**Smell:** High-level aspirations ("better UX", "more consistent operations") with no way to know if they happened.

**Impact:** Difficult prioritization, endless "almost done" feeling, and scope creep.

**Detection signals:**
- Goals use words like "improve", "better", "more" without metrics
- No way to answer "did we achieve this?" with yes/no
- Success criteria missing or generic

**How to avoid:**
- Mandate at least 3–5 **clear goals** with observable signals
- Include at least 2–3 basic metrics or qualitative checks
- Every goal should be answerable: "Yes, we did this" or "No, we didn't"

---

## Quick Validation Checklist

Before finalizing a PRD, verify:

- [ ] Scope covers ONE release/phase/problem area (not entire system)
- [ ] Architecture details live in separate docs (only links here)
- [ ] QA standards are referenced, not embedded
- [ ] No manual traceability matrices
- [ ] Every goal is observable and testable
- [ ] Non-goals section explicitly lists what's out of scope
- [ ] DoD has 5-12 concrete, binary checkboxes
