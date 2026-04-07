# Pilot-Centric SMTP Wiring — Discussion Précis

## Purpose

This précis captures the pilot-aligned email direction for the system, narrowed to the parts that still matter:

- **new staff invitations**
- **company onboarding email verification**
- **shift reports to stakeholders**

The selected provider is **Resend**.

---

## Core decision

The system should use **Resend in two distinct roles**:

1. **Supabase Auth email delivery**
   - for onboarding verification and auth-owned invite flows
2. **Application email delivery**
   - for shift reports and other business-owned notifications

This is not duplication. It is a clean separation of responsibility.

---

## Ownership split

### Supabase Auth owns auth email

Use Supabase native auth email capability for:

- company onboarding email verification
- staff invite acceptance flows, where routed through auth
- password reset and other credential/account flows

These emails are part of the authentication boundary, not the business-notification boundary.

### The application owns business email

Use an app-level email service for:

- shift reports to stakeholders
- non-auth operational notifications
- any future business workflow email that is not part of sign-in or account verification

---

## Pilot wiring model

### 1) Supabase Auth + Resend SMTP

Configure Supabase Auth to send its built-in auth emails through **Resend SMTP**.

This covers:

- confirm sign-up
- invite user
- reset password
- other auth-native email flows used by the app

### 2) App EmailService + Resend

Implement a narrow application email service for business email only.

This covers:

- shift report delivery
- any stakeholder-facing operational report or notification outside auth

The application should not attempt to replace Supabase for auth email.

---

## Practical architecture

```txt
Auth / onboarding / invite verification
  -> Supabase Auth
  -> Resend SMTP

Shift reports / business notifications
  -> App EmailService
  -> Resend
```

This is the pilot-sized architecture.

It avoids two common mistakes:

- forcing all email through the application when Supabase already handles auth email well
- forcing business/report email through Supabase Auth, which is the wrong abstraction

---

## What must be configured

## Supabase side

Supabase needs to be configured for auth email properly:

- email confirmation enabled
- Site URL set correctly
- allowed redirect URLs set correctly
- Resend SMTP credentials configured
- auth email templates adjusted to route back through the application callback path if needed

This allows onboarding verification and invite flows to behave like first-class app flows rather than generic hosted-auth leftovers.

## Application side

The app needs a thin email boundary for non-auth mail:

- `EmailService` interface
- Resend-backed implementation
- shift report template/rendering
- delivery status logging
- retry behavior for failed sends where operationally appropriate

---

## Recommended pilot boundary

The application-facing interface should stay narrow and use-case driven.

Example shape:

```ts
export interface EmailService {
  sendShiftReport(input: ShiftReportEmail): Promise<EmailSendResult>;
}
```

Do not expose raw provider-specific send methods throughout the system.

Provider details belong in infrastructure only.

---

## Delivery policy

For pilot, email delivery should be treated differently depending on type.

### Auth email

Auth email is owned by Supabase and follows the auth flow requirements.

### Shift reports

Shift report email is a business side effect.

That means:

- report generation or persistence should not be coupled too tightly to mail transport success
- failed sends should be visible and retryable
- the system should record whether the report email was sent successfully

This avoids making third-party SMTP availability the single point of failure for business workflow completion.

---

## Why this is pilot-aligned

This approach keeps the system small, understandable, and reversible.

It gives the pilot:

- branded and functional onboarding verification
- staff invite support without inventing custom auth email machinery
- business-owned shift report delivery
- a clean separation between auth mail and app mail
- an architecture that can grow later without forcing growth now

It does **not** introduce:

- a generalized communications platform
- unnecessary queueing or worker infrastructure
- provider-specific sprawl throughout domain code
- premature analytics or deliverability feature work

---

## Final recommendation

For pilot:

- use **Supabase Auth + Resend SMTP** for onboarding verification and auth-owned invite email
- use an **app-level EmailService backed by Resend** for shift reports
- keep the application boundary narrow
- keep provider details in infrastructure
- treat business email as a side effect with visible delivery status

That is the clean, pilot-centric SMTP wiring for the system.
