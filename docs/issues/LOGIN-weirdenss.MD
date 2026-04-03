**Root cause confirmed.** Here's the full picture:

## Why `email@gmail.com` couldn't sign in

**The Supabase Studio "Add user" button defaults to "Send invitation"** — not "Create new user". When you used it:

1. Studio called the **invite API** (`POST /auth/v1/invite`)
2. GoTrue created the user row with **no password** and **email unconfirmed**
3. GoTrue sent an invitation email to Mailpit (the local mail sink at `http://127.0.0.1:54324`)
4. The user shows as **"Waiting for verification"** in the Studio
5. Until the invite link is clicked (in Mailpit), the user **has no password and can't sign in**

I just reproduced this exactly with `testinvite@gmail.com` — same result: `invalid_credentials` on login, email sitting in Mailpit unclaimed.

**What happened to your original `email@gmail.com`**: You likely created it the same way (invite). Then a `db reset` wiped the user before the invite was ever accepted, so it appeared to vanish completely.

## The fix for local dev

When using the Studio dashboard to add test users, use the **second option**: **"Add user" → "Create new user"** (not "Send invitation"). This creates the user with a password and auto-confirms the email immediately.

Alternatively, the `/auth/sign-up` page in the app (`http://localhost:3000/auth/sign-up`) would also work since `enable_confirmations = false` in `config.toml` auto-confirms signups.