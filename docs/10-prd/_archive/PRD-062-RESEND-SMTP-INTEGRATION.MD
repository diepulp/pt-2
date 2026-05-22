**PRD-062 – Resend SMTP Integration for Auth + Shift Emails**

```yaml
meta:
  version: 0.1
  status: Draft
  owner: Platform (Lead Architect)
  date: 2026-04-06
linked_documents:
  - docs/00-vision/smpt-client/pilot-centric-smtp-wiring-precis(1).md
  - supabase/config.toml
```

### 1. Summary

PT-2 must send two categories of email reliably during the pilot: (a) Supabase Auth-managed flows (sign-up confirmation, staff invites, password resets) and (b) business notifications such as shift reports. Resend is the single provider chosen for both, but each category needs its own integration surface—Supabase over SMTP for auth, and a narrow application EmailService for business traffic.citedocs/00-vision/smpt-client/pilot-centric-smtp-wiring-precis(1).md:5-190

### 2. Problem Statement

- Current Supabase config has confirmations disabled and SMTP blank, so onboarding/invite emails never send, blocking users like vladimir.ivanov.dev@gmail.com.citesupabase/config.toml:120-199
- The app lacks a governed email boundary; shift reports are not delivered and no delivery telemetry exists.
- Ops need a pilot-safe, reversible strategy using Resend without over-building infrastructure.

### 3. Goals & Non-Goals

| ID  | Goal                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------ |
| G1  | Enable Supabase Auth email confirmations/invites via Resend SMTP with correct redirects.                                       |
| G2  | Provide an application EmailService (Resend-backed) dedicated to shift report notifications, including delivery logging/retry. |
| G3  | Maintain strict separation between auth boundary and business emails per pilot précis.                                         |

| ID  | Non-Goal                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| NG1 | Building a generic communications platform or marketing email capability.                                                                            |
| NG2 | Introducing queues/workers beyond what’s necessary for retries.                                                                                      |
| NG3 | Replacing Supabase Auth’s native email templates with custom senders.citedocs/00-vision/smpt-client/pilot-centric-smtp-wiring-precis(1).md:74-190 |

### 4. Users & Stakeholders

- **New operators / invited staff** – receive verification/invite emails to access PT-2.
- **Pit bosses & compliance managers** – receive shift reports and must know if delivery fails.
- **Platform/SRE** – manage Resend credentials and monitor delivery.

### 5. Requirements

1. **Supabase Auth Wiring**
   - Turn on `auth.email.enable_confirmations = true`, set `site_url`, and add `/auth/confirm` + `/auth/error` + `/start` to `additional_redirect_urls`.citesupabase/config.toml:120-199
   - Configure `[auth.email.smtp]` with Resend SMTP credentials (`host smtp.resend.com`, username `resend`, password = Resend API key, port 587 STARTTLS default).
   - Update auth email templates so CTA links point at PT-2 routes that call `/auth/confirm` before redirecting to `/start`.
   - Validate sign-up + invite flows end-to-end (Playwright/CLI) against both Mailpit (dev) and Resend sandbox.

2. **Resend Secrets & Domains**
   - Provision two verified sender domains or subdomains (e.g., `auth.mail.pt2.dev` and `ops.mail.pt2.dev`) in Resend.
   - Create separate API keys: one scoped for Supabase’s SMTP block, one for application API usage.
   - Document rotation + storage (e.g., Doppler / environment secrets) and enforce via CI env checks.

3. **Application EmailService**
   - Introduce `services/notifications/email-service.ts` interface with `sendShiftReport(input)` contract (pilot only).
   - Implement Resend REST client (`lib/email/resend-client.ts`) that can send HTML/React templates and append `Resend-Idempotency-Key`.
   - Persist each send attempt (`email_outbox` table) with payload hash, status (`queued/sent/failed`), provider message ID, and retry metadata.
   - Provide admin visibility (temporary table view or log) for failed sends with manual retry button/CLI.

4. **Observability & Retry**
   - Capture Supabase-auth SMTP failures via Supabase logs; set up alerting for repeated 4xx/5xx from Resend.
   - For shift reports, implement exponential backoff (max 3 retries) and mark rows as `needs_attention` after final failure.

5. **Rollout Sequencing**
   - WS1 Supabase config, WS2 secrets/domain, WS3 EmailService, WS4 QA/verification (see §8).

### 6. Success Metrics

- 100% of new signup/invite flows deliver emails and show “Confirmed” status in Supabase within 5 minutes (staging + prod).
- ≥95% of scheduled shift reports sent within 2 minutes of generation; remaining 5% must appear in retry queue.
- Zero incidents of business email being routed through Supabase Auth or vice versa (verified via code audit & logs).

### 7. Assumptions & Dependencies

- Resend domains can be verified before pilot launch.
- Supabase project allows custom SMTP and template edits.
- Shift report generation already exists; this PRD only covers delivery.
- Future business emails will reuse the EmailService pattern rather than adding new pathways.

### 8. Workstreams & Timeline

| WS  | Name                          | Owner                 | Dependencies  | Description                                                                                            |
| --- | ----------------------------- | --------------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| WS1 | Supabase Auth SMTP enablement | Platform              | None          | Toggle confirmations, configure Resend SMTP, update templates/redirects, add infra docs.               |
| WS2 | Secrets & domain ops          | DevOps                | WS1 (partial) | Verify domains, mint API keys, update secret stores & CI env validation.                               |
| WS3 | App EmailService              | Backend               | WS2           | Implement Resend client, EmailService abstraction, outbox persistence, retry logic, telemetry.         |
| WS4 | Verification & QA             | QA / Eng Productivity | WS1-3         | Playwright + manual flows (signup, invite, shift report), monitor Resend dashboards, finalize runbook. |

### 9. Risks & Mitigations

| Risk                                         | Impact | Mitigation                                                                                    |
| -------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| DNS verification delay blocks auth emails    | High   | Start WS2 early; use subdomains to avoid disruption; keep Mailpit fallback for local testing. |
| SMTP misconfiguration causes silent failures | High   | Add automated health check hitting Supabase invite endpoint daily; alert if Resend rejects.   |
| Retry loop floods Resend on outage           | Medium | Cap retries to 3 with jitter and mark rows `needs_attention` for manual action.               |
| Future email use cases bypass EmailService   | Medium | Add ESLint/codeowners rule for direct Resend usage outside `lib/email`.                       |

### 10. Open Questions

1. Do we need branded templates for pilot or can we use Supabase defaults with updated copy?
2. Should shift report failures surface in the dashboard UI or an ops-only panel?
3. Is there a need to log Resend webhooks for delivered/open events during pilot, or is “sent” sufficient?

---

**Next Steps**

- Approve PRD and spin up WS1–WS4 trackers.
- Coordinate with security for storing Resend API keys.
- Schedule Playwright run once WS1 lands to confirm user flows end-to-end.
