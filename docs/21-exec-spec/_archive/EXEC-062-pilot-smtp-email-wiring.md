---
id: EXEC-062
title: "Exec Spec: Pilot SMTP & Email Wiring"
owner: Lead Architect
status: Draft
date: 2026-04-06
prd_ref: docs/10-prd/PRD-062-pilot-smtp-email-wiring-v0.md
adr_refs: [ADR-016, ADR-024]
---

# Exec Spec: Pilot SMTP & Email Wiring

> This document contains implementation details. It is allowed to churn.
> Changes here should NOT invalidate the PRD.

## 1) Implementation Overview

Two independent tracks delivering email capability for pilot:

- **Track A** — Configure Supabase Auth to send auth-owned email through Resend SMTP (config only, no application code)
- **Track B** — Implement a narrow `EmailService` with `sendShiftReport`, backed by Resend API, with an append-only send attempt log

- **PRD:** `docs/10-prd/PRD-062-pilot-smtp-email-wiring-v0.md`

### Key design decision: append-only send log

Each send attempt (including retries) is a new row. "Dismissed" is a final-status append, not a mutation of a prior row. This keeps RLS at casino-scoped SELECT + INSERT with no UPDATE policies. Full attempt history is preserved as a side effect.

**Chain interpretation rule:** The latest row in an attempt chain (by `created_at`) is the current disposition for that lineage. A `dismissed` row is terminal — it suppresses further retry visibility for that chain. A `sent` row is terminal — the delivery succeeded. Only chains whose latest row is `failed` appear as actionable in operational views.

## 2) Database Changes

### 2.1 New tables

**`email_send_attempt`** — append-only log of every email delivery attempt.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `casino_id` | `uuid` | NOT NULL, FK `casino(id)` | Casino scope |
| `original_attempt_id` | `uuid` | FK `email_send_attempt(id)`, NULL for first attempt | Links retries to original |
| `recipient_email` | `text` | NOT NULL | |
| `template` | `text` | NOT NULL | e.g. `'shift_report'` |
| `status` | `text` | NOT NULL, CHECK IN (`'sent'`, `'failed'`, `'dismissed'`) | Terminal per row |
| `provider_message_id` | `text` | NULL | Resend message ID on success |
| `error_summary` | `text` | NULL | Safe error detail on failure |
| `payload_ref` | `jsonb` | NULL | Minimal context (shift ID, report date) — not full payload |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

### 2.2 Migrations

- Migration file: `supabase/migrations/YYYYMMDDHHMMSS_create_email_send_attempt.sql`
- Generate timestamp with `date +"%Y%m%d%H%M%S"` at creation time

### 2.3 RLS policies

Casino-scoped SELECT + INSERT only. No UPDATE, no DELETE.

| Policy | Operation | Using / With Check |
|--------|-----------|--------------------|
| `email_send_attempt_select` | SELECT | `casino_id = current_setting('app.casino_id')::uuid` |
| `email_send_attempt_insert` | INSERT | `casino_id = current_setting('app.casino_id')::uuid` |

Standard hybrid pattern C with `auth.uid() IS NOT NULL` guard per ADR-015/020. Policy expressions shown here are illustrative; final SQL should follow the project's canonical hybrid RLS pattern for session-var and JWT-derived casino scoping.

### 2.4 RPCs (SECURITY DEFINER)

None required for pilot. This table uses standard casino-scoped RLS with append-only INSERT semantics only. Unlike protected writes that require SECURITY DEFINER to bypass deny-by-default policies or mitigate transaction-local session-var hazards (e.g. loyalty ledger, audit log), `email_send_attempt` is intentionally writable through the authenticated server-side Supabase client after request-scoped RLS context is established via `set_rls_context_from_staff()` in the server action.

**Precondition:** Every server action that reads or inserts into this table must call `set_rls_context_from_staff()` before any query. The Supabase client used must be the request-scoped server client (not the service-role client), so that RLS policies are evaluated. If implementation cannot guarantee request-scoped context prior to read/insert, this design must be revisited and a SECURITY DEFINER RPC introduced before release.

## 3) Service Layer

### 3.1 Service registration

- Service slice: **EmailService** — pilot-scoped utility service, not a full bounded context. Registered in SRM as a thin service owning `email_send_attempt` only. May be absorbed into a broader operational context if email scope grows post-pilot.
- SRM registration: v4.23.0
- Pattern: B (HTTP boundary via server actions)

### 3.2 Service files

| File | Purpose |
|------|---------|
| `services/email/dtos.ts` | `ShiftReportEmailInput`, `EmailSendResult`, `EmailSendAttemptDto` |
| `services/email/mappers.ts` | Row-to-DTO mapping for send attempt log |
| `services/email/crud.ts` | `insertSendAttempt`, `getSendAttemptsByCasino`, `getFailedAttempts` |
| `services/email/index.ts` | `createEmailService` factory exposing `sendShiftReport` |

### 3.3 Infrastructure adapter

| File | Purpose |
|------|---------|
| `lib/email/types.ts` | `EmailProvider` interface (provider-agnostic) |
| `lib/email/resend-adapter.ts` | Resend API implementation of `EmailProvider` |
| `lib/email/index.ts` | Adapter factory reading env vars |

Provider interface is minimal:

```ts
interface EmailProvider {
  send(input: { to: string; subject: string; html: string }): Promise<{ messageId: string }>;
}
```

## 4) API Routes

No dedicated route handlers. Email sending is triggered via server actions from the shift-close flow.

| Action | Location | Auth | Description |
|--------|----------|------|-------------|
| `sendShiftReportAction` | `app/(protected)/shifts/actions.ts` | Staff session | Sends shift report email, logs attempt |
| `retryShiftReportAction` | `app/(protected)/shifts/actions.ts` | Staff session (admin role) | Retries a failed attempt (inserts new row) |
| `dismissFailedAttemptAction` | `app/(protected)/shifts/actions.ts` | Staff session (admin role) | Appends dismissed-status row |

## 5) Frontend Components

No new pages or components in this spec. For pilot, failure visibility is satisfied by an admin-only operational query or temporary internal view backed by `email_send_attempt`. A polished user-facing dashboard is not required. Minimum bar: casino admins can see actionable failed attempt chains and trigger retry or dismiss actions.

## 6) Data Flow

```
Track B — Shift Report Email:

  shift close action
    → createEmailService(supabase)
    → service.sendShiftReport({ casino, shiftId, recipients })
      → build HTML from template + report data
      → resendAdapter.send({ to, subject, html })
        → success: insert attempt row (status: 'sent', provider_message_id)
        → failure: insert attempt row (status: 'failed', error_summary via safeErrorDetails)
      → return EmailSendResult

  retry action (admin)
    → read original attempt row
    → call service.sendShiftReport() with original_attempt_id link
    → new attempt row appended

  dismiss action (admin)
    → insert attempt row (status: 'dismissed', original_attempt_id link)

Track A — Supabase Auth SMTP (config only):

  Supabase Dashboard / config.toml:
    → SMTP host: smtp.resend.com
    → SMTP port: 587 (STARTTLS) — Resend also supports 465 (SSL); confirm against current Resend SMTP docs at implementation time
    → SMTP user: resend
    → SMTP pass: re_<API_KEY>
    → Sender: noreply@<verified-domain>
  Site URL + redirect URLs per environment
  Email templates: verification, invite, password reset
```

## 7) Security Posture

| Control | Implementation | Reference |
|---------|---------------|-----------|
| Casino isolation | RLS SELECT + INSERT on `email_send_attempt` | ADR-015/020 |
| Context derivation | `set_rls_context_from_staff()` in server actions | ADR-024 |
| No UPDATE/DELETE | Append-only log, no mutation policies | NFR-7 |
| Credential isolation | `RESEND_API_KEY` in env vars only | FR-B7 |
| Provider containment | Resend types confined to `lib/email/resend-adapter.ts` | FR-B8 |

## 8) Test Plan

### Unit tests (Jest)

- [ ] `resend-adapter.ts`: send success returns messageId
- [ ] `resend-adapter.ts`: send failure throws with safe error
- [ ] `mappers.ts`: row-to-DTO mapping
- [ ] `createEmailService.sendShiftReport`: success path inserts sent-status row
- [ ] `createEmailService.sendShiftReport`: failure path inserts failed-status row

### Integration tests

- [ ] Server action: `sendShiftReportAction` with mocked provider → attempt row in DB
- [ ] Server action: `retryShiftReportAction` → new attempt row linked to original

### Manual validation

- [ ] Track A: sign-up verification email arrives via Resend SMTP
- [ ] Track A: invite email arrives via Resend SMTP
- [ ] Track A: password reset email arrives via Resend SMTP
- [ ] Track B: shift report email delivered to test casino admin
- [ ] Local/dev: Mailpit captures auth emails correctly

## 9) Rollout Plan

- [ ] Resend account created, sender domain verified
- [ ] `RESEND_API_KEY` and `RESEND_SENDER_DOMAIN` provisioned in environment
- [ ] Migration applied
- [ ] Types regenerated (`npm run db:types-local`)
- [ ] SRM updated to v4.23.0 (EmailService context)
- [ ] Supabase Auth SMTP configured per Track A
- [ ] Auth email templates customized with pilot branding
- [ ] Site URL and redirect URLs set per environment
- [ ] Auth flows validated end-to-end in staging
- [ ] Shift report email validated end-to-end in staging

## 10) Known Gaps / Deviations from PRD

| PRD Specification | Implementation | Rationale |
|-------------------|---------------|-----------|
| "Persistent send log" (model unspecified) | Append-only `email_send_attempt` table | Simplest RLS model; full audit trail; avoids UPDATE policies |
| Failure visibility surface | Admin-only operational query or temporary internal view; polished dashboard deferred | PRD requires visibility, not polish |
| Shift report template content | Stub template for wiring validation | Report content owned by ShiftIntelligenceService (PRD-055/056) |
| Provider send followed by log insert | Best-effort two-step side effect; if provider send succeeds but DB insert fails, operator-visible history may be incomplete | Accepted pilot limitation; revisit with outbox/transactional dispatch if this becomes operationally material |

## Links

- PRD: `docs/10-prd/PRD-062-pilot-smtp-email-wiring-v0.md`
- Vision: `docs/00-vision/smtp-client/pilot-centric-smtp-wiring-precis.md`
- Provider direction: `docs/00-vision/smtp-client/smtp-provider-direction-pilot.md`
