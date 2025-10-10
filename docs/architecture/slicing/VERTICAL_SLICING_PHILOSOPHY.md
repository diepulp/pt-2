Version: 1.0.0
Applies to: PT-2 Canonical Architecture 
Author: Architecture Council
Last Updated: 2025-10-09

1. Purpose

This document defines the Vertical Slicing Philosophy for the Player Tracker (PT) architecture.
It formalizes how new functionality should be developed end-to-end — from database schema → service layer → server actions → hooks → UI components — as self-contained, domain-bounded vertical slices.

The intent is to replace horizontally fragmented development (e.g., isolated CRUD services with no consumer integration) with a feature-centric, domain-integrated delivery model.

2. Context

The PT service layer currently provides CRUD and index functions only.

No corresponding hooks, server actions, or UI slices have been implemented.

As a result, the architecture exhibits horizontal slicing: service logic exists in isolation from presentation and orchestration layers.

This document defines how to evolve toward Vertical Slicing, aligning each feature across the stack.

3. Definition
3.1 Vertical Slice

A Vertical Slice is an autonomous, feature-specific path through all layers of the system:

Database → Service → Server Action → Hook → Component

Each slice delivers complete user-visible functionality and is independently testable, deployable, and refactorable.

3.2 Scope Boundary

A slice belongs to one domain (e.g., Player, Visit, RatingSlip) and must not depend on sibling slices.
Cross-domain access occurs only through service contracts, never via direct imports.

4. Core Principles
Principle	Description
Single Responsibility	Each slice serves one coherent feature or use case (e.g., "Create Player", "Close Rating Slip").
End-to-End Integrity	Every slice traverses all layers (schema, service, server action, hook, UI).
Minimal Surface Area	Each slice exposes only the interfaces required by its consumer layer.
Domain Locality	Code and tests for a slice are colocated within the domain directory (/domains/<domain>/slices/<feature>).
KISS > DDD	Avoid premature layering and abstractions beyond CRUD+orchestration; no factories or DI frameworks.
Forward Only	Schema, API, and behavior evolve incrementally with no backward mutations.

5. Directory Structure:

6. Layer Responsibilities (Per Slice)
Layer	Responsibility	Example
Service	Database interaction and core logic using SupabaseClient<Database>.	ratingslipService.create(data)
Server Action	Secure entry point for server execution, calling service methods.	createRatingSlipAction(formData)
Hook	Client or shared React hook that wraps server actions for reusability.	useCreateRatingSlip()
Component	UI implementation consuming the hook.	<CreateRatingSlipForm />
Test	Unit + integration tests validating full slice path.	jest test for useCreateRatingSlip()

7. Implementation Pattern (To be determined)

8. Testing Strategy (**Current chosen strategy needs revision**)

Each slice must include:

Service tests (unit): verify data layer correctness

Action tests (integration): ensure server action uses correct service

Hook tests (mocked Supabase): ensure UX interaction correctness

Tests are colocated within their slice directory for cohesion.
Cross-layer tests reside under /tests/integration/<domain>/<feature>.

9. Cross-Domain Interaction

All cross-domain interactions occur only via exported service contracts, e.g.:

Never import from another domain’s slices/ directory.

10. Migration Plan (PT-2 Alignment) **preliminary**

Phase	Objective	Deliverables
Phase 1	Identify CRUD endpoints lacking vertical integration	Inventory document under /docs/audit/vertical-slice-gap.md
Phase 2	For each CRUD function, create minimal server action + hook	1:1 mapping coverage
Phase 3	Incrementally introduce UI components consuming hooks	MVP-visible features
Phase 4	Add slice-level integration tests	Cohesion validation
Phase 5	Document and standardize patterns	Update this doc and `docs/patterns/SERVICE_TEMPLATE.md`

11. Anti-Patterns

❌ Anti-Pattern	✅ Correct Pattern
Shared “utils” performing DB operations	Service encapsulates all data access
UI directly calling Supabase	Use server action or hook
Global hooks managing cross-domain state	Domain-bounded hooks only
Flat /hooks directory for all features	Co-located slice hooks under domain

12. **Pros of the Vertical Approach (Applied to PT)**
✅ 2.1 Regression Containment

Each slice encapsulates its logic, state, validation, and actions.
When a regression occurs, it’s confined to a single slice’s scope — no global ripple effect through shared hooks or utils.

Example: Changing validation for RatingSlip.create cannot break RatingSlip.close, because their schemas and hooks are isolated.

✅ 2.2 Incremental Refactorability

Slices can be rewritten, optimized, or deprecated without refactoring the entire system.
This directly mitigates the “catastrophic rebuild” pattern from PT-1, which was caused by:

Monolithic type systems

Shared utility dependencies

Horizontal abstraction drift

✅ 2.3 Cognitive Locality

Developers operate on complete, domain-bounded units:

“Everything I need to understand this feature lives in one directory.”

This lowers onboarding friction and reduces the mental overhead of navigating cross-layer dependencies.

✅ 2.4 Natural Test Cohesion

Each slice contains its own tests; they evolve together with implementation.
End-to-end slice tests (from action → hook → UI) closely resemble real usage, giving higher confidence and fewer integration regressions.

✅ 2.5 Architectural Resilience

Since the service layer remains the only horizontally shared abstraction, future technology shifts (e.g., Supabase→Neon, React API changes) require only service adaptation — not full-stack rewrites.

✅ 2.6 Enhanced Observability

Slice-level logging and error boundaries can be added per feature, making runtime diagnostics more granular and actionable.

3. Cons / Trade-Offs
⚠️ 3.1 Duplication of Patterns

You’ll see small amounts of repeated logic (e.g., error handling, toast notifications, minor validation).
Solution: use template scaffolds, not shared “helpers.”
Duplication here is intentional isolation, not inefficiency.

⚠️ 3.2 Code Volume & Directory Depth

The codebase becomes more tree-like — many small folders.
Mitigation: enforce consistent naming (create, update, close) and short import aliases.

⚠️ 3.3 Discoverability for Newcomers

Without clear documentation, a new developer might not know where to add a new slice.
Mitigation: maintain VERTICAL-SLICING-BOOTSTRAP.md and enforce PR templates.

⚠️ 3.4 Cross-Slice Reuse Needs Discipline

Developers might be tempted to import one slice’s hook into another.
Mitigation: enforce domain-only exports (service public; slices private) via linting or index.ts access control.

⚠️ 3.5 Slight Overhead for Global Consistency

UI look-and-feel consistency needs shared design primitives (e.g., Button, Modal) in /components/ui, else every slice might drift.
Mitigation: restrict shared elements to purely presentational primitives — never logic.