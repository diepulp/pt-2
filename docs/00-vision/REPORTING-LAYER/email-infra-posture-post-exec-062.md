# Email Infrastructure Posture — Post EXEC-062 Implementation

> Follow-up artifact documenting Track B SMTP client posture after EXEC-062 delivery.
> Date: 2026-04-15
> Ref: EXEC-062, FIB-H (Shift Report WS3)

## Status: Structurally Complete, Not Operationally Live

EXEC-062 Track B delivered the full service layer, migration, RLS, adapter, server actions, SRM registration, and unit tests. Resend SDK (`6.10.0`) is installed. However, the email pathway has never sent a live email — `RESEND_SENDER_DOMAIN` is not provisioned and no sender domain has been verified with Resend.

## Implemented Artifacts

| Layer | Files | Status |
|-------|-------|--------|
| Migration | `supabase/migrations/20260406224212_create_email_send_attempt.sql` | Applied |
| RLS | Pattern C hybrid SELECT + INSERT, no UPDATE/DELETE | Applied |
| Infrastructure adapter | `lib/email/types.ts`, `resend-adapter.ts`, `index.ts` | Implemented |
| Service layer | `services/email/dtos.ts`, `mappers.ts`, `crud.ts`, `index.ts` | Implemented |
| Server actions | `app/actions/email/send-shift-report.ts`, `retry-shift-report.ts`, `dismiss-failed-attempt.ts` | Implemented |
| SRM registration | EmailService, v4.23.0, Operational context, Pattern B | Registered |
| Unit tests | `services/email/__tests__/` (3 files) | Passing |
| Dependency | `resend@^6.10.0` in `package.json` | Installed |

## Known Issues (P1–P4)

### P1 — `getFailedAttempts` is not chain-aware

`services/email/crud.ts:37-48` filters `eq('status', 'failed')` without checking whether a subsequent `dismissed` or `sent` row has superseded it in the attempt chain. A dismissed chain still appears as actionable. The spec's chain interpretation rule ("latest row by `created_at` is current disposition") is not implemented.

### P2 — `dismissFailedAttemptAction` requires email credentials

`app/actions/email/dismiss-failed-attempt.ts:36` constructs `createEmailProvider()` even though dismissal never sends an email. This will throw if `RESEND_API_KEY` or `RESEND_SENDER_DOMAIN` are missing, making dismissal impossible without email credentials.

### P2 — `retryShiftReportAction` uses stub HTML, bypasses service

`app/actions/email/retry-shift-report.ts:63` sends a stub HTML body (`<h1>Shift Report (Retry)</h1>`) and calls `provider.send` + `insertSendAttempt` directly, bypassing `emailService.sendShiftReport()`. The spec requires delegating to the service method with `original_attempt_id` linking.

### P3 — No integration tests for server actions

EXEC-062 test plan specifies integration tests for `sendShiftReportAction` and `retryShiftReportAction` with mocked provider and real DB. These do not exist.

### P4 — Missing service layer files

`schemas.ts` (Zod), `keys.ts` (React Query), `http.ts` (ServiceHttpResult wrappers) are absent. Acceptable for pilot since no frontend surface exists, but needed if a failure dashboard is built.

## Gaps Relevant to FIB-H WS3 (Shift Report Distribution)

FIB-H WS3 requires sending a canonical PDF as an email attachment to bounded recipient classes. Three gaps must be resolved when WS3 begins — none block WS1 or WS2.

| Gap | Detail | Effort |
|-----|--------|--------|
| `RESEND_SENDER_DOMAIN` not set | Missing from `.env`, `.env.example`. Adapter throws at construction. | 2 min (env var + domain verification in Resend dashboard) |
| `EmailProvider` has no attachment support | Interface is `{ to, subject, html }` only. Resend SDK supports `attachments: { content: Buffer, filename: string }[]` natively. | ~30 min (interface extension + adapter passthrough) |
| Service not PDF-aware | `sendShiftReport` builds inline HTML. WS3 needs a method that accepts a PDF buffer and attaches it. | ~1 hr (new method or extend existing with optional attachment param) |

## Recommendation

- **Do not fix P1–P2 issues preemptively.** They only matter when an operational failure dashboard or retry surface exists.
- **Do not extend the EmailProvider for attachments until WS2 delivers the PDF generation pipeline.** The attachment shape depends on how the PDF buffer is produced.
- **Do provision `RESEND_SENDER_DOMAIN` and verify the sender domain early** — this has a Resend-side approval lag (DNS verification) that should not be on WS3's critical path.
