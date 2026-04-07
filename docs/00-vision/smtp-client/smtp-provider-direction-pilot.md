# SMTP Provider Direction — Pilot Recommendation

## Decision

Use **Resend** as the initial SMTP-capable transactional email provider for the pilot.

## Why Resend

Resend is the best fit for pilot needs because it offers:

- **SMTP support**, so the app can keep a provider-agnostic email adapter boundary
- a **generous free tier** for pilot-scale transactional email
- a simpler setup path than AWS SES
- room to start with invites and notifications without dragging in unnecessary platform complexity

At the time of review, Resend's free tier allows:

- **100 emails/day**
- **3,000 emails/month**

That is enough for pilot flows such as:

- staff invites
- onboarding notifications
- access-related messages
- low-volume operational notifications

## Why not Amazon SES first

Amazon SES is cheap, but it is not the cleanest pilot starting point.

### Constraints

- new SES accounts typically begin in **sandbox**
- sandbox sending is restricted to **verified recipients/domains**
- sandbox accounts are capped at **200 emails per 24 hours** until production access is granted
- the “free” story is narrower than people often assume

### Verdict

SES is a valid later optimization for cost, but it adds friction too early for this slice.

## Why not Google

Google is not the right answer for this use case.

### Reality

- Google Workspace SMTP relay is tied to **paid Workspace infrastructure**
- it is better understood as company mail relay, not a startup-friendly transactional email product
- it does not offer the same pilot-friendly posture as a provider built for app email

### Verdict

Use Google only if the product intentionally wants to route through an existing Workspace mail environment. That is not the present need.

## Pilot-aligned implementation posture

Adopt Resend behind a thin `EmailService` application port.

### Recommended boundary

```txt
Domain / route / use-case
  -> EmailService interface
  -> Resend SMTP adapter
```

### Rules

- keep provider details in infrastructure only
- do not leak Resend-specific objects into domain or route logic
- use transactional templates only
- treat email delivery as a **side effect**, not the core authoritative transaction
- record delivery status so failed sends can be retried operationally

## Recommended implementation choice

### Phase 1

- implement a narrow `EmailService`
- back it with **Resend SMTP**
- support only:
  - staff invite emails
  - basic notification emails

### Later evolution, only if needed

- move from SMTP to Resend API if provider-specific features become useful
- add outbox/worker delivery if guaranteed dispatch becomes necessary
- swap providers later without changing application-facing use cases

## Final recommendation

Use **Resend now**.

It gives the pilot the least annoying path to transactional email, keeps the architecture clean, and avoids dragging AWS SES setup friction into a slice that only needs to send the damn invite.
