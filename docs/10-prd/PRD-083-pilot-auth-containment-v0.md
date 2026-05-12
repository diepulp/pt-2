---
id: PRD-083
title: Pilot Authentication Containment Gate
owner: Product / Architecture
status: Draft
affects: [ARCH-SRM, ADR-015, ADR-018, ADR-024, ADR-030, ADR-041, ADR-044, SEC-001, SEC-002, PRD-060]
created: 2026-05-12
last_review: 2026-05-12
phase: Pilot Containment
pattern: B
http_boundary: false
---

# PRD-083 — Pilot Authentication Containment Gate

## 1. Overview

- **Owner:** Product / Architecture
- **Status:** Draft
- **Summary:** This PRD defines the pilot-stage authentication containment boundary for PT-2. It replaces unrestricted public signup with manually approved, allowlist-gated magic-link access. It preserves the existing `/start` post-auth progression while adding explicit pilot authorization before OTP issuance and before onboarding progression. The slice is intentionally small: it is a pilot airlock, not an identity platform, billing system, CRM, or generalized admin subsystem.

---

## 2. Problem & Goals

### 2.1 Problem

PT-2 production is publicly reachable, but the product is still in controlled pilot validation. The current public flow allows an arbitrary visitor to create an auth user and attempt onboarding toward tenant/operator environment creation. For a casino operations system, authentication alone must not be enough to create operational data, casinos, companies, staff bindings, or access to operator surfaces.

The product needs a minimal containment loop: prospective operators request access, an application owner approves them, approved emails can receive magic links, and the system revalidates pilot authorization before first-login progression. The previous direct EXEC-SPEC path exposed a critical design flaw: pre-staff onboarding must require a real authenticated Supabase session without assuming the user already has an active `staff` binding.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Block unapproved public access before auth user creation or OTP issuance | Unapproved email receives closed-pilot messaging; no OTP send call occurs |
| **G2**: Preserve approved pilot onboarding | Approved email can receive a magic link and complete first-login registration/bootstrap through `/start` |
| **G3**: Separate authentication from pilot authorization | Session-time `/start` check rejects authenticated but non-allowlisted users |
| **G4**: Provide a public request-access path | Public visitor can submit a pending access request without creating an auth user |
| **G5**: Keep approval operations constrained | Internal review can approve/reject requests without becoming a generalized admin platform |

### 2.3 Non-Goals

- Stripe, billing, subscriptions, pricing, seat licensing, or trial plans.
- Enterprise IAM, SSO, SAML, OIDC, custom token systems, or custom magic-link infrastructure.
- Public self-service tenant provisioning.
- Full invitation platform, resend flows, team invites, invitation lifecycle orchestration, or delegated invite management.
- Full admin console, RBAC redesign, user-management console, CRM, support tooling, or operational analytics dashboard.
- Global `middleware.ts` auth-platform refactor unless a later architecture decision proves it is required.
- Automated approvals; pilot access remains manually approved.

---

## 3. Users & Use Cases

- **Primary users:** approved pilot operator, prospective pilot lead, application owner/admin.
- **Secondary users:** unauthenticated public visitor, authenticated but unauthorized user.

**Top Jobs:**

- As an **approved pilot operator**, I need to sign in with my approved email so that I can proceed through the existing PT-2 onboarding flow.
- As a **prospective pilot lead**, I need to request access without creating an auth account so that the application owner can review my request.
- As an **application owner/admin**, I need to approve or reject pilot access requests so that production access remains controlled.
- As an **authenticated but unauthorized user**, I need to be redirected to request access so that authentication is not mistaken for pilot authorization.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Auth Surface Containment:**
- Disable public signup so `supabase.auth.signUp()` is not reachable from public routes.
- Replace pilot-facing password login with email-only magic-link login.
- Retire forgot-password and update-password public routes by redirecting them to the magic-link login surface.
- Display closed-pilot messaging with a request-access path for non-approved emails.

**Pilot Authorization:**
- Check approved-email allowlist before calling `supabase.auth.signInWithOtp()`.
- Check approved-email allowlist again during `/start` before onboarding or operator route progression.
- Preserve `/start` as the canonical post-auth router; do not introduce a generalized policy engine.
- Distinguish an authenticated pre-staff pilot user from an active staff member so approved first-login onboarding still works.

**Request and Approval Loop:**
- Provide a public request-access form that creates a pending request, not an auth user.
- Provide a minimal internal pilot review capability to list pending requests, approve, reject, and optionally record notes.
- On approval, create or restore the approved-email allowlist entry through a server-side authorized path.
- Support status-based revocation for pilot approval without lifecycle automation.

**Data Integrity:**
- Canonicalize email comparisons and uniqueness case-insensitively.
- Prevent duplicate pending requests for the same canonical email.
- Ensure approval state and allowlist state cannot diverge during normal approval.
- Treat `approved_email_allowlist` as the authoritative pilot authorization source; `pilot_access_requests.status` is historical/operator workflow state only.

### 4.2 Out of Scope

- Lifecycle expiry, resend workflows, team seats, or invitation-token management.
- CRM enrichment of access requests.
- Multi-admin workflow, delegated tenant administration, or customer-managed approval.
- Production-grade audit console. Minimal approval logging is in scope only for operability and provenance.

---

## 5. Requirements

### 5.1 Functional Requirements

- Public signup must be disabled or redirected; no public path may create an auth user through `signUp()`.
- Login must accept email only and use Supabase OTP/magic-link after allowlist approval.
- Non-approved emails must receive closed-pilot/request-access messaging and must not trigger OTP delivery.
- Request-access submission must be available to unauthenticated visitors and must not create an auth user.
- `/start` must reject authenticated users whose email is not currently approved.
- Approved authenticated users who do not yet have a staff binding must be able to complete first-login registration/bootstrap.
- Registration/bootstrap mutations must reject unauthenticated calls at mutation level, not only through page routing.
- Internal pilot review must be limited to explicitly authorized application owner/admin identities.
- Approval must be idempotent enough that double-click/retry does not create inconsistent request or allowlist state.
- Revocation must be status-based and must make future OTP issuance and `/start` progression fail for the revoked email.

### 5.2 Non-Functional Requirements

- The containment loop must fail closed: unknown email, missing approval, revoked approval, or authorization-check error must not send OTP or enter onboarding.
- Service-role access must be server-only and guarded by an explicit authority check before use.
- User-facing errors must not reveal whether an auth user exists or expose database/internal error details.
- The implementation must be MVP-sane and avoid generalized IAM, RBAC, CRM, billing, feature-flag, or admin-platform abstractions.
- Email lookup for login and approval must be case-insensitive and whitespace-normalized.

> Architecture details: See `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`, `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`, `docs/30-security/SEC-001-rls-policy-matrix.md`, and `docs/30-security/SEC-002-casino-scoped-security-model.md`.

---

## 6. UX / Flow Overview

**Flow 1: Prospective Pilot Request**
1. Public visitor reaches login/signup surface.
2. Visitor chooses or is redirected to request pilot access.
3. Visitor submits name, email, casino/property name, role, estimated table count, and optional message.
4. System creates a pending request and confirms submission without creating an auth user.

**Flow 2: Internal Pilot Approval**
1. Application owner/admin opens the minimal pilot review surface.
2. Owner reviews pending requests.
3. Owner approves or rejects the request.
4. Approval creates the allowlist entry; rejection keeps the user outside the auth path.

**Flow 3: Approved Magic-Link Login**
1. Approved pilot operator enters email on the magic-link login surface.
2. Server checks the allowlist before OTP issuance.
3. Approved email receives a magic link.
4. User follows the link and lands in `/start`.

**Flow 4: Session-Time Containment**
1. `/start` confirms auth presence.
2. `/start` revalidates pilot approval for the session email.
3. If not approved, user is redirected to request access.
4. If approved, existing onboarding/operator progression continues.

**Flow 5: First-Login Onboarding**
1. Approved authenticated user with no staff binding reaches registration/bootstrap.
2. Mutations require a real authenticated Supabase session.
3. Mutations do not require an existing active staff binding before first tenant bootstrap.
4. Existing bootstrap flow creates the required tenant/staff binding under approved pilot authorization.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **Supabase Auth OTP** — Magic-link delivery must be configured in Supabase project settings.
- **Existing `/start` gateway** — Must remain the post-auth route resolver and gain a pilot authorization check.
- **PRD-060 onboarding flow** — First-login registration/bootstrap must continue to work for approved pre-staff users.
- **SRM update** — The operational containment capability must be registered in architecture documentation before EXEC implementation.
- **Surface Classification Standard** — New UI surfaces must declare rendering and data aggregation patterns before build.

### 7.2 Risks & Open Questions

- **Pre-staff auth mismatch** — Standard staff-bound middleware will block approved first-login users. The EXEC-SPEC must define an auth-only, allowlist-aware pre-staff path for onboarding mutations.
- **Approval authority ambiguity** — The internal review surface must define who can approve before any service-role operation is implemented.
- **Service-role blast radius** — Approval and allowlist operations bypass RLS. The implementation must place authority checks before service-role client creation and include tests for non-admin denial.
- **Duplicate request spam** — Public request-access can be abused. MVP mitigation is canonical-email uniqueness for pending requests plus safe duplicate response.
- **Revocation semantics** — Product accepts simple approval/revocation only. Revocation is status-based so provenance and operational debugging context are preserved.
- **Magic-link E2E boundary** — External email link-click cannot be fully tested without email interception. E2E must cover rejection and request-access paths; OTP issuance may be verified at server/action level.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Unapproved public visitors cannot sign up, receive OTP, enter onboarding, create a tenant, or reach operator surfaces.
- [ ] Approved emails can receive a magic link and complete the existing `/start` progression including first-login registration/bootstrap.
- [ ] Public request-access submission creates a pending request and never creates an auth user.
- [ ] Minimal internal review can approve, reject, and revoke pilot access without generalized admin-platform features.

**Data & Integrity**
- [ ] Email matching and uniqueness are canonicalized case-insensitively.
- [ ] Duplicate pending requests and repeated approval attempts do not create inconsistent state.
- [ ] Approval/rejection state and allowlist state remain consistent after normal retries.

**Security & Access**
- [ ] Service-role allowlist operations are server-only and guarded by explicit application-owner/admin authority.
- [ ] Onboarding mutations reject unauthenticated calls while allowing approved authenticated pre-staff users.
- [ ] Revoked or non-approved authenticated sessions fail closed at `/start`.

**Testing**
- [ ] Unit/integration tests cover allowlist lookup, request submission, OTP rejection, approval/revocation, and onboarding mutation auth behavior.
- [ ] E2E tests cover request-access submission, unapproved login rejection, signup/password-route retirement, and approved pre-staff onboarding success where feasible.

**Operational Readiness**
- [ ] Approval, rejection, revocation, and OTP rejection are logged with enough context to debug access issues without exposing secrets.
- [ ] Rollback or mitigation path exists to disable public signup/password routes and manually manage allowlist rows if the review surface is disabled.

**Documentation**
- [ ] Architecture docs register the operational containment capability and its owned tables/services.
- [ ] Known limitations are documented: no billing, no IAM, no invitation lifecycle, no custom email infrastructure.

**Surface Governance**
- [ ] Surface classification is declared for magic-link login, request-access, and internal pilot review surfaces.
- [ ] ADR-041 compliance is captured before EXEC-SPEC implementation begins.

---

## 9. Related Documents

- **Source FIB-H:** `docs/issues/gaps/pilot-auth-containment/FIB-H-PILOT-AUTH-CONTAINMENT-001.md`
- **Rejected EXEC-SPEC draft:** `docs/21-exec-spec/FIB-PILOT-AUTH-001/EXEC-080-pilot-auth-containment.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Service Layer:** `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **Security / RLS:** `docs/30-security/SEC-001-rls-policy-matrix.md`, `docs/30-security/SEC-002-casino-scoped-security-model.md`
- **Governance:** `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`, `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md`, `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md`
- **ADRs:** `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`, `docs/80-adrs/ADR-018-security-definer-governance.md`, `docs/80-adrs/ADR-024_DECISIONS.md`, `docs/80-adrs/ADR-030-auth-pipeline-hardening.md`, `docs/80-adrs/ADR-041-surface-governance-standard.md`
- **Prerequisite PRD:** `docs/10-prd/_archive/PRD-060-company-registration-first-property-bootstrap-v0.md`

---

## Appendix A: Custodial Chain Notes

- The previous EXEC-first artifact is not a build contract. It identified useful implementation ideas but failed custodial review because it did not preserve approved pre-staff onboarding.
- This PRD is the product alignment artifact. A new EXEC-SPEC must be generated from this PRD after architecture/security review resolves the open decisions.
- The one-line invariant for the downstream EXEC-SPEC is: if authentication alone can create an operator environment, the pilot boundary is broken.
