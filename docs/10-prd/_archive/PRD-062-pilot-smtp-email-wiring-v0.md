---
id: PRD-062
title: Pilot SMTP & Email Wiring
owner: Lead Architect
status: Draft
affects: [ARCH-SRM-v4.22.0, ADR-016, ADR-024, ADR-030, PRD-060]
created: 2026-04-06
last_review: 2026-04-06
phase: Phase 1 (Foundational)
pattern: B
http_boundary: true
---

# PRD-062 — Pilot SMTP & Email Wiring

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** The system currently has no email delivery capability. Staff invites use a manual "copy link" flow, auth emails (verification, password reset) use Supabase's default mailer, and shift reports have no delivery channel. This PRD wires two distinct email paths for pilot: (1) Supabase Auth configured to send its built-in auth emails through Resend SMTP, and (2) a narrow application-level `EmailService` backed by Resend for business email (shift reports). The two paths reflect a clean ownership split — Supabase Auth owns auth email, the application owns business email — and avoid both forcing all email through the app and routing business email through Supabase Auth. Pilot implementation uses Resend as the single provider: Supabase consumes Resend via SMTP for auth-owned flows, while the application uses a narrow Resend-backed `EmailService` for shift reports. Operational setup must follow current Resend provider documentation and Supabase Auth SMTP/template configuration guidance.

---

## 2. Problem & Goals

### 2.1 Problem

Three email needs exist today with no delivery path:

1. **Auth email** — Supabase Auth sends verification, invite, and password-reset emails through its default mailer, which delivers generic unbranded messages with poor deliverability. Operators cannot customize these and recipients may not trust them.

2. **Staff invites** — The onboarding flow (PRD-ONBOARDING-v0.1) requires admins to manually copy an invite link because no email transport exists. This is a manual workaround, not a designed flow.

3. **Shift reports** — Stakeholders need end-of-shift summaries delivered to their inbox. No business email service exists in the application.

These are two fundamentally different ownership boundaries — auth email belongs to the authentication system, business email belongs to the application — but both need a provider. Resend serves both roles without duplication.

### 2.2 Goals

| Goal | Observable Signal |
|------|-------------------|
| **G1**: Auth emails (verification, invite, password reset) are delivered through Resend SMTP with pilot branding (casino/operator-branded sender identity, app name, and callback link in body) | A new user completing sign-up receives a verification email with casino/operator-branded sender identity, not from Supabase's default mailer |
| **G2**: Supabase Auth invite flow sends acceptance emails automatically | An admin inviting a staff member triggers an email without manual link copying |
| **G3**: Shift report emails are delivered to casino administrators of the owning casino | After shift close, casino admins receive a shift summary email with delivery status recorded |
| **G4**: Email delivery is a side effect, not a transaction gate | A failed shift-report email does not block report persistence; the failure is visible and retryable |
| **G5**: Provider details are contained in infrastructure | No Resend-specific types, imports, or configuration leak into domain or route-handler code |

### 2.3 Non-Goals

- Generalized notification platform or communications service
- Email queueing infrastructure, workers, or outbox pattern (ADR-016 — deferred post-MVP)
- Marketing email, bulk email, or email analytics
- Deliverability dashboards or bounce management UI
- Custom email template editor for operators
- SMS, push notifications, or in-app messaging
- Replacing Supabase Auth email ownership with application-managed auth email
- Shift report content/format design (separate concern — this PRD wires delivery only)

---

## 3. Users & Use Cases

- **Primary users:** Casino administrators (shift report recipients, failure visibility), new staff being onboarded (auth invite recipients), pit bosses and floor supervisors (shift report consumers post-pilot)

**Top Jobs:**

- As a **new staff member**, I need to receive a branded invite email so that I can accept my account and begin working without relying on someone to send me a link manually.
- As an **operator onboarding their casino**, I need verification emails to arrive reliably and look professional so that my staff trusts the system from day one.
- As a **pit boss**, I need shift reports delivered to my inbox after shift close so that I can review performance without logging into the system.
- As an **administrator**, I need to see whether a shift report email was delivered or failed so that I can take action if a stakeholder did not receive it.

---

## 4. Scope & Feature List

### Track A — Supabase Auth SMTP Configuration

- Configure Supabase Auth to send all auth-owned email (verification, invite, password reset) through Resend SMTP
- Enable email confirmation for pilot environments where onboarding verification is required
- Set Site URL and redirect targets (`/auth/confirm`, `/auth/error`, post-confirmation landing) per environment
- Customize auth email templates to pilot branding bar: casino/operator-branded sender identity; app name and callback link in body; no custom logo or full HTML treatment required for pilot
- Validate auth flows end-to-end in local/dev using mail capture tooling where applicable, and in staging/prod against Resend

### Track B — Application EmailService

- `EmailService` interface with a single pilot method: `sendShiftReport`
- Resend-backed implementation isolated in infrastructure layer
- Shift report email template (plain HTML rendering — no custom logo or rich layout required for pilot)
- Persistent send log recording delivery attempts and outcomes per casino, with implementation favoring append-only attempt logging unless pilot retry/dismiss workflow requires mutable status on existing records
- Delivery status captured synchronously from provider response (no webhook in pilot)
- Retry capability for failed sends, capped and visible to operators
- Delivery-failure visibility through a temporary operational surface until a fuller reporting view exists
- Shift report recipients for pilot: casino administrators of the owning casino only. Named stakeholder lists and company-level recipients are out of scope.
- Environment-based configuration (API key via env var, sender domain)

---

## 5. Requirements

### 5.1 Functional Requirements

**Track A — Supabase Auth SMTP**

- FR-A1: Supabase Auth SMTP settings are configured with Resend SMTP host, port, and credentials.
- FR-A2: Auth email templates include pilot branding: casino/operator-branded sender identity, app name and callback link in body. Custom logo and full HTML treatment are not required for pilot.
- FR-A3: Site URL and redirect URLs are configured for the deployment environment.
- FR-A4: Verification email is sent on sign-up and routes the user back to the application callback path.
- FR-A5: Invite email is sent when an admin calls `inviteUserByEmail()` and routes to the invite acceptance page.
- FR-A6: Password reset email is sent and routes to the reset confirmation page.
- FR-A7: Auth email wiring must be validated against both local/dev mail capture tooling (where applicable) and a real provider-backed environment before pilot release.

**Track B — Application EmailService**

- FR-B1: An application-level email service exposes a typed `sendShiftReport` method. Provider implementation is isolated in infrastructure.
- FR-B2: `sendShiftReport` accepts recipient, casino context, and report data; returns a result indicating success or failure with a provider reference.
- FR-B3: Every send attempt is persistently logged with casino scope, recipient, status, error summary (if failed), and timestamps.
- FR-B4: Failed sends are retryable. Retries must be bounded to prevent provider flooding during outages.
- FR-B5: Failed sends remain visible to operators until retried successfully or explicitly dismissed.
- FR-B6: Shift report recipients for pilot are casino administrators of the owning casino. Named stakeholder lists and company-level distribution are out of scope.
- FR-B7: Provider credentials are read from environment variables, never hardcoded.
- FR-B8: No provider-specific types leak outside the infrastructure adapter.

### 5.2 Non-Functional Requirements

- NFR-1: Email send latency must not block the shift-report persistence path. Send is fire-and-record, not fire-and-gate.
- NFR-2: Email send logs must be casino-scoped with no cross-casino visibility.
- NFR-3: Resend free tier (100 emails/day, 3,000/month) is sufficient for pilot. No paid plan required at launch.
- NFR-4: Auth email templates must render correctly in major email clients (Gmail, Outlook, Apple Mail).
- NFR-5: Pilot configuration must support distinct sender/domain setup for auth-owned email and business-owned email, whether via separate domains or clearly separated sender identities.
- NFR-6: Provider credentials must be stored in environment or secret-management infrastructure and documented for rotation before pilot rollout.
- NFR-7: Email send logging should prefer the simplest casino-scoped access model that satisfies pilot operations. If retry/dismiss actions mutate existing log rows, limited UPDATE access may be required in addition to casino-scoped read/write. If the log is implemented as append-only attempts, simpler read/insert scoping is preferred.

> Architecture, schema, and API details: see SRM v4.22.0, SLAD, and `types/database.types.ts`.

---

## 6. UX / Flow Overview

### Auth Email Flow (Track A)

```
Operator signs up → Supabase Auth → Resend SMTP → branded verification email → user clicks link → app callback → account confirmed
Admin invites staff → supabase.auth.admin.inviteUserByEmail() → Supabase Auth → Resend SMTP → branded invite email → staff clicks accept → app callback → account created
```

### Shift Report Email Flow (Track B)

```
Shift closes → shift report persisted → app sends shift report email → provider delivers to casino admins
                                      → send attempt logged (sent/failed)
                                      → if failed: operator sees failure, can retry
```

No new UI pages are introduced by this PRD. Delivery status is visible through existing admin or operational views (detail TBD by consuming PRD). Any failure visibility or retry surface introduced for pilot may be temporary and operationally scoped; this PRD does not require a polished end-user dashboard for email operations.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Resend account with verified sending domain | Not started | Required for both tracks; free tier sufficient |
| Supabase Auth SMTP configuration (Dashboard or config.toml) | Available | Supabase supports custom SMTP natively |
| Shift report data model | Exists (ShiftIntelligenceService) | PRD-055/056 scope — this PRD wires delivery, not report content |
| Email send log table migration | New | Part of this PRD's deliverables |
| Environment variable provisioning (RESEND_API_KEY, RESEND_SENDER_DOMAIN) | Not started | Needed for deployment environments |
| Verified Resend sender domain or subdomain | Not started | Required before staging/prod validation of both auth and shift-report mail |
| Local/dev mail capture tooling (e.g. Mailpit) | Available | Useful for validating Supabase auth flow wiring without spending provider quota |
| Supabase Site URL / redirect configuration | Not started | Required so auth links land in the correct application callback flow |

### 7.2 Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| Resend free-tier rate limits hit during pilot | Monitor send volume; 100/day is generous for single-casino pilot. Upgrade path is straightforward. |
| Auth email template customization limited by Supabase | Supabase allows HTML template overrides. Validate during implementation. |
| Shift report content format not yet defined | This PRD wires delivery only. Report content/rendering is owned by ShiftIntelligenceService (PRD-055/056). Stub template is sufficient for wiring validation. |
| DNS domain verification delay | Begin domain verification early; Resend typically verifies within minutes for simple DNS setups. |
| EmailService has a single consumer at pilot launch | Interface is one method, no abstraction layers, no queueing. Track A validates the provider independently. Growth path exists but is not pre-built. |
| SMTP or redirect misconfiguration causes auth links to fail silently | Validate sign-up, invite, and reset flows end-to-end in a real environment before pilot release |
| Repeated retries during provider outage create noise or rate-limit pressure | Cap retries and leave failures visible for manual handling |
| Sender-domain setup drifts between auth and app mail, confusing recipients | Document and standardize sender identities as part of rollout |

---

## 8. Definition of Done (DoD)

The PRD is **Done** when:

**Functionality**
- [ ] Auth verification, invite, and password-reset emails arrive through Resend SMTP with pilot branding
- [ ] Shift report email is delivered to casino administrators of the owning casino after shift close
- [ ] Failed email sends are recorded and retryable with bounded retry behavior

**Data & Integrity**
- [ ] Every email send attempt is persistently logged with casino scope, status, and timestamps
- [ ] Shift report persistence is not blocked by email send failure

**Security & Access**
- [ ] Email send logs are casino-scoped with no cross-casino visibility
- [ ] Provider credentials are stored in environment variables, not in code or database
- [ ] No provider-specific types leak outside the infrastructure adapter
- [ ] The chosen send-log model (append-only vs limited mutable status) is documented, and its casino-scoped access model is kept no more complex than pilot operations require

**Testing**
- [ ] Unit tests for email service covering send success and failure paths
- [ ] Auth flows (verification, invite, reset) validated end-to-end in a real provider-backed environment
- [ ] Local/dev validation completed using mail capture tooling where applicable
- [ ] Happy-path manual test: shift report email delivered to a test recipient

**Operational Readiness**
- [ ] Verified sender domain/subdomain configured and documented
- [ ] Credential rotation/storage procedure documented
- [ ] Failed sends are visible through an operational surface and can be retried

**Documentation**
- [ ] SRM updated to register EmailService bounded context
- [ ] Supabase Auth SMTP configuration documented (env vars, template locations, redirect URLs)
- [ ] Known limitations documented (no webhook tracking, no outbox, pilot rate limits)

---

## 9. Related Documents

- **Vision / Strategy:** `docs/00-vision/smtp-client/pilot-centric-smtp-wiring-precis.md`, `docs/00-vision/smtp-client/smtp-provider-direction-pilot.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.22.0)
- **Onboarding / Invites:** `docs/00-vision/company-onboarding/PRD-ONBOARDING-v0.1.md`, `docs/00-vision/company-onboarding/SPEC-ONBOARDING-v0.1.md`
- **Outbox Pattern (deferred):** ADR-016
- **Over-Engineering Guardrail:** `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`
- **Error Handling:** `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md`, INV-ERR-DETAILS (`safeErrorDetails`)
- **Security Model:** `docs/30-security/SEC-002-casino-scoped-security-model.md`
- **Edge Transport:** `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`
- **Shift Intelligence:** PRD-055, PRD-056 (report content — separate scope)

Implementation should consult current Resend documentation for SMTP/API configuration and current Supabase documentation for Auth SMTP, redirect URLs, and email template behavior.
