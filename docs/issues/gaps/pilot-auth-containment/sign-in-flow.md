`PILOT_ADMIN_EMAILS` is not yet set in `.env.local`. Here's the complete browser test playbook:

---

## Setup (one-time)

**1. Add admin email to `.env.local`**
```
PILOT_ADMIN_EMAILS=your@email.com
```
Restart the dev server after saving.

**2. Start local Supabase + dev server**
```bash
npx supabase start
npm run dev
```

---

## Flow 1 — Unapproved sign-in attempt

1. Navigate to `http://localhost:3000/signin`
2. Enter any email **not** in `approved_email_allowlist` (e.g. `unknown@test.com`)
3. Submit

**Expected:** Form transitions to:
> "This is a closed pilot. Request access to be notified when a spot opens."
> Link: "Request access" → `/request-access`

No OTP email is sent.

---

## Flow 2 — Request access form

1. Click the "Request access" link (or navigate directly to `/request-access`)
2. Fill in all required fields:
   - **Name**: Jane Smith
   - **Email**: `applicant@test.com`
   - **Casino**: Grand Casino
   - **Role**: Pit Manager
   - **Tables** (optional): 12
   - **Message** (optional): Testing pilot access
3. Submit

**Expected:** Form replaces with:
> "Thanks for your interest! We'll be in touch when a pilot spot opens."

**Idempotency test:** Submit again with the same email. Expected: same success message (no error, no duplicate rejection).

**Required field test:** Clear Name, submit without it. Expected: browser-native "Please fill in this field" tooltip — no custom error.

---

## Flow 3 — Admin reviews the request

1. Navigate to `http://localhost:3000/pilot-review`
   - If your session email matches `PILOT_ADMIN_EMAILS` → you see the review table
   - If not authenticated → redirects to `/signin`
   - If authenticated but not admin → redirects to `/request-access`

2. Find the `applicant@test.com` request in the table
3. Click **Approve**

**Expected:** Row disappears (refresh triggered), email is now in `approved_email_allowlist` with `status = 'active'`.

Verify in Supabase Studio:
```sql
select * from approved_email_allowlist where email = 'applicant@test.com';
select * from pilot_access_requests where email = 'applicant@test.com';
```

---

## Flow 4 — Approved user signs in

1. Navigate to `/signin`
2. Enter `applicant@test.com` (now approved)
3. Submit

**Expected:** Form transitions to:
> "Check your email for a sign-in link."

OTP email is sent via Supabase. Check Inbucket at `http://localhost:54324` (local mail capture), open the email, click the magic link.

**Expected post-click:** Lands at `/start` which evaluates staff binding:
- No staff binding → redirects to `/register`
- If for some reason a staff row exists → continues to `/pit`

---

## Flow 5 — Admin rejects a request

1. Submit a new request with a different email (e.g. `rejected@test.com`)
2. Go to `/pilot-review`, click **Reject** on that row

**Expected:** Row disappears. In Supabase Studio:
```sql
select status, reviewed_by, reviewed_at from pilot_access_requests where email = 'rejected@test.com';
-- status = 'rejected', reviewed_by = your admin email
```
The `approved_email_allowlist` table has **no entry** for `rejected@test.com`.

---

## Flow 6 — Retired routes

| URL                     | Expected                                                  |
| ----------------------- | --------------------------------------------------------- |
| `/auth/sign-up`         | Renders `RequestAccessForm` — no "Password" field visible |
| `/auth/forgot-password` | Redirects to `/auth/login`                                |
| `/auth/update-password` | Redirects to `/auth/login`                                |

---

## Flow 7 — Unauthenticated deeplink containment

Without being signed in, navigate directly to each of these:

| URL                | Expected redirect |
| ------------------ | ----------------- |
| `/pit`             | → `/signin`       |
| `/register`        | → `/signin`       |
| `/bootstrap`       | → `/signin`       |
| `/start`           | → `/signin`       |
| `/shift-dashboard` | → `/signin`       |

---

## Flow 8 — Revoke access

In Supabase Studio (or via an admin UI if you add one):
```sql
-- Can also test by calling revokePilotAccessAction directly from a Next.js admin page
update approved_email_allowlist set status = 'revoked' where email = 'applicant@test.com';
```

Then try to sign in as `applicant@test.com` again. Expected: "This is a closed pilot." — no OTP issued.

---

## Quick seed for approved email (skip Flows 1–3)

If you want to test the approved sign-in path without going through the request/review cycle:

```sql
insert into approved_email_allowlist (email, status, invited_by)
values ('applicant@test.com', 'active', 'seed')
on conflict (email) do update set status = 'active';
```

Then go straight to Flow 4.