Implement a minimal transactional email sending layer using the existing Resend SMTP adapter infrastructure.

Context:
- Stack: Next.js App Router + TypeScript
- Existing infrastructure already present:
  - `lib/email/smtp-adapter.ts`
  - `lib/email/index.ts`
  - `createEmailProvider()`
  - nodemailer wired to `smtp.resend.com`
  - env vars:
    - `RESEND_API_KEY`
    - `RESEND_SENDER_DOMAIN`
- Sender format should resolve to:
  - `D3LT <noreply@auth.d3lt.app>`

Objective:
Wire application-level email sending outside Supabase Auth flows.

Requirements:
1. Create a small email service layer.
2. Add a reusable send helper abstraction.
3. Add a demo-request notification flow.
4. Keep implementation intentionally minimal.
5. No queues, workers, retries, template CMS, analytics, or notification framework.
6. No direct client-side email sending.
7. All sending must happen server-side only.
8. Use existing SMTP adapter infrastructure only.
9. Use HTML email body strings for now (no React Email yet).
10. Follow KISS posture.

Deliverables:

1. Create:
   `lib/email/send-email.ts`

Responsibilities:
- Export reusable `sendEmail()` helper
- Internally call `createEmailProvider()`
- Apply default sender:
  `D3LT <noreply@${process.env.RESEND_SENDER_DOMAIN}>`
- Accept:
  - `to`
  - `subject`
  - `html`

2. Create:
   `lib/email/send-demo-request-notification.ts`

Responsibilities:
- Accept:
  - name
  - email
  - company (optional)
  - message (optional)
- Send internal notification email to:
  `vladimir.ivanov.dev@gmail.com`
- Subject:
  `New D3LT demo request`
- Include formatted HTML body.

3. Add optional auto-response helper:
   `lib/email/send-demo-request-confirmation.ts`

Responsibilities:
- Send short confirmation email back to requester.
- Subject:
  `We received your D3LT demo request`
- Tone:
  professional, concise, operational.

4. Create:
   `app/api/demo-request/route.ts`

Responsibilities:
- POST handler only
- Parse JSON body
- Validate required fields minimally
- Call:
  - `sendDemoRequestNotification`
  - `sendDemoRequestConfirmation`
- Return JSON success response
- No DB persistence yet
- No rate limiting yet
- No CAPTCHA yet

5. Ensure:
- TypeScript strict compatibility
- No secrets exposed to client
- No email sending in client components
- No coupling to Supabase Auth templates

6. Keep architecture intentionally boring:
- API route
→ service layer
→ resend SMTP adapter

Do not:
- introduce background jobs
- introduce queues
- introduce BullMQ
- introduce template engines
- introduce React Email
- introduce analytics
- introduce event emitters
- introduce webhook handling
- introduce notification preferences
- introduce domain abstractions

Goal:
A clean, production-sane transactional email slice for demo-request notifications using the already-configured Resend SMTP infrastructure.