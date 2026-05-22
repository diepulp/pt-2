Now I have enough to give a complete, definitive analysis.

---

## Full Context

### What the PRDs specify

**PRD-083 Flow 2 (Admin Approval):** Admin approves → allowlist row upserted → `pilot_access_requests.status = 'approved'`. **No magic link is sent at this step.** The allowlist is the authorization gate only.

**PRD-083 Flow 3 (User-initiated login):** User returns to `/signin` → enters approved email → `sendMagicLinkAction` checks allowlist → approved → `signInWithOtp` called → email sent → user clicks → `/auth/confirm` → `/start` → auto-binds demo staff → `/pit`.

The proactive OTP send inside `approvePilotAccessAction` (`review-actions.ts:185-223`) is a **UX convenience added beyond the PRD spec** — the PRD never requires the admin to push the link. The canonical path is user-initiated.

---

### What's in production vs local

**Local is 3 commits ahead of `origin/main`:**

| Commit     | What it contains                                                                 |
| ---------- | -------------------------------------------------------------------------------- |
| `db270d28` | Today's walkthrough email changes                                                |
| `940d73c9` | Merge of `7b2269a9`                                                              |
| `7b2269a9` | Dev password form + **dev bypasses in `/start`, layouts, demo, magic-link-form** |

Production (`origin/main`) has the full `feat/pilot-auth` gate (`33dac8d1`) — the allowlist, `sendMagicLinkAction`, `approvePilotAccessAction` — **but is missing the dev bypass layer**. In production `start/page.tsx`, there is no `isDevAuth` check — `isPilotAdmin` and `checkAllowlistGate` always run unconditionally.

---

### Bug 1 — Production: magic link arrives without admin approval

The allowlist gate **is** deployed in production. For a user to receive a magic link without admin approval, their email must already be in `approved_email_allowlist` with `status = 'active'` — either from a previous test run or seeded. The gate works; the allowlist already has the email.

A second possibility: `PILOT_ADMIN_EMAILS` is **not set in Vercel production env**. It exists only in `.env.local` (pulled from Vercel's development env, not production). Without it:
- `isPilotAdmin()` returns `false` for all emails — admin email not blocked from requesting OTPs
- Admin can enter their own email on `/signin` and receive a magic link directly, bypassing `/pilot-review`

Check: `! vercel env ls production | grep PILOT_ADMIN`

---

### Bug 2 — Local: admin approves, no magic link arrives

**Sentry is silent** → `signInWithOtp` returns no error → Supabase accepted the request. The email was submitted. Three candidates:

1. **`isPilotAdmin(targetEmail)` is true** — `PILOT_ADMIN_EMAILS=diepulp@gmail.com` is set in `.env.local`. If the request being approved has `email = diepulp@gmail.com`, the OTP block fires (`if (!isPilotAdmin(targetEmail))` → skipped) — no link is ever sent, silently.

2. **Wrong `emailRedirectTo`** — locally neither `NEXT_PUBLIC_SITE_URL` nor `VERCEL_URL` is set, so `siteUrl` resolves to `http://localhost:3000`. The magic link in the email points to `http://localhost:3000/auth/confirm`. If the user clicks this on a machine where `:3000` isn't running, or checks email on a phone, the link goes nowhere. Supabase accepts the call (no error) but the link is broken in practice.

3. **Email in spam** — Supabase's default sender (`noreply@mail.supabase.io`) has poor deliverability. The email arrived but was filtered.

---

### The canonical path (per PRD-083) works correctly

After the admin approves, the user needs to return to `/signin`, enter their email, and click "Send sign-in link." `sendMagicLinkAction` will now find them on the allowlist and issue the OTP. **This path works end-to-end** — the proactive OTP from `approvePilotAccessAction` is the unreliable part.

---

### What needs to happen

| #   | Action                                                     | Where                                               |
| --- | ---------------------------------------------------------- | --------------------------------------------------- |
| 1   | Verify `PILOT_ADMIN_EMAILS` in Vercel production           | `vercel env ls production`                          |
| 2   | Add `NEXT_PUBLIC_SITE_URL` to `.env` and Vercel production | Needed for correct `emailRedirectTo` on all paths   |
| 3   | Push 2 missing commits to `origin/main`                    | Aligns production with local dev-auth fix           |
| 4   | Check `approved_email_allowlist` in production DB          | Explains the "no-approval" magic link in production |