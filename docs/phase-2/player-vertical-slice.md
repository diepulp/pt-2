Phase 2 – Player Vertical Slice (Kanban Breakdown)
🎯 Goal

Deliver one working vertical slice (DB → service → API/server action → UI component) for the Player domain.
TDD enforced by writing tests before implementation, but only for immediate needs.

🟢 Backlog (ideas, not active)

Player search by name/email

Player update

Player soft-delete / archive

Validation schemas for optional fields (dob, gender, etc.)
(Not needed for MVP; only pull when another slice depends on them)

🔵 To Do (scope-limited)

DB Migration – ensure player table exists in Supabase baseline.

Fields: id, email (unique), name, created_at.

Test: Create Player Happy Path

Write failing Jest test: createPlayer → ok:true + persisted record.

Service: Implement create()

Minimal service with Supabase insert.

No abstractions, no enums yet.

Test: Duplicate Email Error

Write failing test for unique email violation.

Service: Handle Duplicate Error

Add minimal error mapping inside create().

Server Action: createPlayerAction

Wrap service call in server action with structured result.

Add 1 integration test.

UI: PlayerForm

Simple React form calling createPlayerAction.

Show success/error message.

🟡 In Progress (limit: 1–2 items max)

Enforce WIP limit → cannot work on UI while DB migration is failing.

Keeps slice vertical, not scattered.

🟣 Done (definition of done)

player table exists with RLS enabled.

Tests: happy-path + duplicate-email case both green.

Service + server action integrated.

One UI form demonstrates end-to-end flow.

CI runs <2min, no broken tests.

🛡 Guardrails Against Over-Engineering

Do not build update/search/delete until another feature requires them.

Do not add Zod schemas until you actually need field validation beyond “email + name required”.

Do not build error enums until ≥2 different operations need structured error codes.

Do not refactor to generic factories until ≥2 services show duplication.

🚦 Workflow Summary

Write failing test.

Implement just enough to pass.

Add 1 error-path test.

Stop.

Move to next slice (Visit).

👉 This gives you a real player onboarding flow in a week or less, with minimal risk of analysis-paralysis.