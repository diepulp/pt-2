# EXEC-062 Implementation Precis — Pilot SMTP & Email Wiring

## What was built

Track B of PRD-062: an application-level `EmailService` backed by Resend, with an append-only send attempt log and three server actions for shift report delivery, retry, and dismissal.

Track A (Supabase Auth SMTP configuration) is operational setup, not application code. It remains a manual configuration step for deployment.

---

## Architecture delivered

```
Shift close flow
  -> sendShiftReportAction (server action)
    -> withServerAction middleware (auth + RLS context)
      -> createEmailService(supabase, provider)
        -> provider.send() via Resend adapter
        -> crud.insertSendAttempt() — append-only log row

Retry flow (admin)
  -> retryShiftReportAction
    -> fetch original attempt
    -> re-send via provider
    -> insert new attempt row (original_attempt_id link)

Dismiss flow (admin)
  -> dismissFailedAttemptAction
    -> insert dismissed-status row (original_attempt_id link)
```

This matches the précis recommendation: business email as a side effect with visible delivery status, provider details in infrastructure only.

---

## Key design decisions

### Append-only send log

Each send attempt (including retries and dismissals) is a new row. No UPDATE or DELETE policies exist on `email_send_attempt`. This yields:

- Simplest RLS model: casino-scoped SELECT + INSERT only
- Full attempt history preserved as a side effect
- Chain interpretation via `original_attempt_id` — latest row by `created_at` is current disposition

### No SECURITY DEFINER RPCs

Unlike most write paths in the system, `email_send_attempt` writes go through the authenticated Supabase client after `set_rls_context_from_staff()` runs in the server action middleware. The append-only nature and non-critical-table status (not in ADR-030 D4 critical table list) made this acceptable for pilot.

### Provider containment

Resend-specific types are confined to `lib/email/resend-adapter.ts`. The service layer and server actions consume only the `EmailProvider` interface from `lib/email/types.ts`. Swapping providers requires changing one file.

---

## Files delivered

### Database

| File | Purpose |
|------|---------|
| `supabase/migrations/20260406224212_create_email_send_attempt.sql` | Table + RLS + index |

### Infrastructure adapter

| File | Purpose |
|------|---------|
| `lib/email/types.ts` | `EmailProvider` interface, `EmailSendOutcome` type |
| `lib/email/resend-adapter.ts` | Resend API implementation (contained) |
| `lib/email/index.ts` | `createEmailProvider()` factory + re-exports |

### Service layer

| File | Purpose |
|------|---------|
| `services/email/dtos.ts` | Pattern B DTOs derived from `Database` types |
| `services/email/mappers.ts` | Row-to-DTO mapping surface |
| `services/email/crud.ts` | `insertSendAttempt`, `getSendAttemptsByCasino`, `getFailedAttempts`, `getSendAttemptById` |
| `services/email/index.ts` | `createEmailService` factory, `EmailServiceInterface` |

### Server actions

| File | Purpose |
|------|---------|
| `app/actions/email/send-shift-report.ts` | `sendShiftReportAction` — send + log |
| `app/actions/email/retry-shift-report.ts` | `retryShiftReportAction` — retry failed attempt (admin) |
| `app/actions/email/dismiss-failed-attempt.ts` | `dismissFailedAttemptAction` — dismiss failed attempt (admin) |

### Tests

| File | Tests | Coverage |
|------|-------|----------|
| `services/email/__tests__/resend-adapter.test.ts` | 7 | 100% |
| `services/email/__tests__/mappers.test.ts` | 4 | 100% |
| `services/email/__tests__/email-service.test.ts` | 15 | 100% |

26 tests total, all passing.

---

## Governance compliance

| Gate | Status |
|------|--------|
| Type-check | Pass (exit 0) |
| Lint | Pass (exit 0, zero warnings) |
| Tests | 26/26 passing |
| Types regenerated | `npm run db:types-local` after migration |
| SRM registered | v4.23.0 — EmailService as pilot utility service |
| RLS pattern | Pattern C hybrid (ADR-015/020) |
| Context derivation | `set_rls_context_from_staff()` via `withServerAction` middleware (ADR-024) |
| Error handling | `safeErrorDetails` throughout (INV-ERR-DETAILS) |
| Provider containment | Resend types confined to `resend-adapter.ts` (FR-B8) |
| Credentials | `RESEND_API_KEY`, `RESEND_SENDER_DOMAIN` from env vars (FR-B7) |

---

## What remains (Track A + deployment)

These are operational configuration steps, not application code:

- [ ] Resend account created, sender domain verified
- [ ] `RESEND_API_KEY` and `RESEND_SENDER_DOMAIN` provisioned in environment
- [ ] Supabase Auth SMTP configured (host: `smtp.resend.com`, port: 587, user: `resend`, pass: `re_<API_KEY>`)
- [ ] Auth email templates customized with pilot branding
- [ ] Site URL and redirect URLs set per environment (`/auth/confirm`, `/auth/error`)
- [ ] Auth flows validated end-to-end (verification, invite, password reset)
- [ ] Shift report email validated end-to-end in staging

---

## Known limitations (pilot-accepted)

| Limitation | Rationale |
|------------|-----------|
| Stub HTML template for shift report | Report content owned by ShiftIntelligenceService (PRD-055/056) |
| No webhook-based delivery tracking | Synchronous provider response sufficient for pilot |
| No outbox pattern | ADR-016 defers queuing infrastructure post-MVP |
| Provider send followed by DB insert is two-step | If send succeeds but insert fails, operator history incomplete — accepted for pilot |
| No polished failure visibility UI | Admin-only operational query satisfies PRD requirement |
| Retry not capped in server action | Operational discipline for pilot; cap if retry abuse observed |

---

## Précis alignment

The implementation follows the original [pilot-centric SMTP wiring précis](pilot-centric-smtp-wiring-precis.md):

- Supabase Auth owns auth email (Track A — config only)
- Application owns business email (Track B — `EmailService`)
- Provider details in infrastructure only
- Business email treated as a side effect with visible delivery status
- No generalized communications platform, no queueing, no provider sprawl
