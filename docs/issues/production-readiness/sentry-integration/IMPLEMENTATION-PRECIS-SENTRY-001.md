# Implementation Precis: Pilot-bounded Sentry Error Tracking

**Feature ID:** FIB-H-SENTRY-001
**EXEC-SPEC:** EXEC-063-sentry-error-tracking
**Branch:** `sentry-integration`
**Date:** 2026-04-08
**Status:** Code complete, pending operational acceptance

---

## What was built

Minimal, pilot-scoped Sentry error tracking for PT-2. The integration captures unhandled exceptions from two existing error boundary surfaces (server runtime and UI panels), scrubs casino-sensitive PII before transmission, and tags events with environment and release metadata for debuggable stack traces.

No new user-facing surfaces, API endpoints, database tables, bounded contexts, or domain services were introduced.

## Artifacts produced

### New files

| File | Purpose |
|------|---------|
| `sentry.client.config.ts` | Client-side Sentry.init — DSN, environment, release, sample rate 1.0, tracing/replay disabled |
| `sentry.server.config.ts` | Server-side Sentry.init — same config, DSN fallback chain (`SENTRY_DSN ?? NEXT_PUBLIC_SENTRY_DSN`) |
| `instrumentation.ts` | Next.js instrumentation hook — loads server config on `nodejs` runtime, exports `onRequestError` |
| `lib/sentry/pii-denylist.ts` | `beforeSend` hook — recursive scrubber for 30+ denylisted fields across 4 categories |
| `docs/21-exec-spec/EXEC-063-sentry-error-tracking.md` | Execution specification with FIB-S traceability |
| `.claude/skills/build-pipeline/checkpoints/FIB-H-SENTRY-001.json` | Pipeline checkpoint |

### Edited files

| File | Change |
|------|--------|
| `next.config.ts` | Wrapped with `withSentryConfig()` for source map upload (org, project, authToken) |
| `app/global-error.tsx` | Added `Sentry.captureException(error)` — replaced dev-only console.error placeholder |
| `components/error-boundary/panel-error-boundary.tsx` | Added `Sentry.captureException(error)` in `componentDidCatch` alongside existing `logError` |
| `package.json` | Added `@sentry/nextjs ^10.47.0` |

## PII denylist coverage

| Category | Fields | Count |
|----------|--------|-------|
| Player identity | `first_name`, `last_name`, `middle_name`, `full_name`, `email`, `phone_number`, `birth_date`, patron/player variants, `recipient_email` | 17 |
| Financial | `average_bet`, `buy_in`, `cash_out*`, `win_loss*`, `ledger_balance`, `current_balance`, `balance_*`, `min_points_balance` | 17 |
| Staff identifiers | `staff_id`, `*_by_staff_id` (12 variants) | 12 |
| Casino context | `casino_id` | 1 |

Scrubbed values are replaced with `[Filtered]` (preserves key structure for debugging). Scrubbing is recursive through nested objects in extras, contexts, breadcrumb data, tags, and user context (user.id preserved for grouping).

## Decisions resolved

| ID | Open question | Resolution |
|----|---------------|------------|
| DEC-001 | SDK package | `@sentry/nextjs` — official Next.js App Router integration |
| DEC-002 | Alert sink | Sentry built-in email alerts on first occurrence of new issues |
| DEC-003 | Source map upload | `withSentryConfig()` at build time via `SENTRY_AUTH_TOKEN` |
| DEC-004 | PII denylist fields | 47 fields across 4 categories derived from `database.types.ts` |

## FIB outcome traceability

| Outcome | How satisfied |
|---------|---------------|
| OUT-1: Unhandled errors captured | `sentry.client.config.ts`, `sentry.server.config.ts`, `instrumentation.ts` (onRequestError), `global-error.tsx`, `panel-error-boundary.tsx` |
| OUT-2: Stack trace + release context | `withSentryConfig` source map upload, `release` tag from `VERCEL_GIT_COMMIT_SHA` |
| OUT-3: PII redacted | `lib/sentry/pii-denylist.ts` beforeSend hook in both runtimes |
| OUT-4: Noise stays low | `sampleRate: 1.0` (pilot is low traffic), no broad instrumentation |
| OUT-5: Alert path exists | DEC-002 — Sentry email alerts (operational config, not code) |
| OUT-6: No new user-facing surface | Zero new UI components, routes, or workflows |

## Validation gates passed

| Gate | Command | Result |
|------|---------|--------|
| type-check | `npm run type-check` | PASS |
| lint | `npm run lint` | PASS |
| build | `npm run build` | PASS |

## FIB rules enforced

| Rule | Enforcement |
|------|------------|
| RULE-1: Only approved surfaces captured | Capture limited to global-error, PanelErrorBoundary, server onRequestError |
| RULE-2: PII redacted before transmission | beforeSend denylist scrubber in both runtimes |
| RULE-3: Single alert route | DEC-002 — email only, no Slack/PagerDuty |
| RULE-4: No new user-facing workflow | Zero new components or routes |
| RULE-5: No tracing/replay/analytics | `tracesSampleRate: 0`, `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0` |

## Environment variables required

| Variable | Scope | Required |
|----------|-------|----------|
| `NEXT_PUBLIC_SENTRY_DSN` | Client (primary), Server (fallback) | Yes |
| `SENTRY_DSN` | Server only | Optional (falls back to public DSN) |
| `SENTRY_AUTH_TOKEN` | Build only | Yes (for source map upload) |
| `SENTRY_ORG` | Build only | Yes |
| `SENTRY_PROJECT` | Build only | Yes |

**Precedence:** Server uses `SENTRY_DSN ?? NEXT_PUBLIC_SENTRY_DSN`. If neither is present, Sentry remains disabled without build failure.

## Remaining operational acceptance (not code)

- [ ] Create Sentry project for PT-2
- [ ] Add env vars to Vercel project settings
- [ ] Configure alert rule: first occurrence of new issue → email to project members
- [ ] Trigger test error in deployed environment → verify in Sentry console with usable stack trace
- [ ] Verify no PII fields appear in test event payload
- [ ] Verify alert fires on test event

## What was explicitly excluded (per FIB)

- Distributed tracing
- Session replay
- Structured logging redesign
- Product analytics or behavior telemetry
- Custom incident dashboard
- Multi-channel alert routing
- Broad instrumentation of every component
- Vendor abstraction layer

## Pipeline metadata

- **Complexity pre-screen:** Streamlined (0 migrations, 0 RLS, 0 SECURITY DEFINER, 0 new contexts, 0 new API surfaces)
- **DA review tier:** Tier 0 (self-certified) — structural + governance validation sufficient
- **External audit:** Applied 7-finding audit delta (privacy verification, alert operational dependency, env precedence, source map wording, WS4 traceability, minimal capture posture, DoD completeness)
