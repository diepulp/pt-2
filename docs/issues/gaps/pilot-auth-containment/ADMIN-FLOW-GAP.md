Here's the complete current posture for the admin role and its implemented functionality.

---

## Admin System: Current State

### Identity & Authentication

Admins are identified by **two independent signals** that both must be true:

1. **`PILOT_ADMIN_EMAILS` env var** — a comma-separated list of email addresses, checked at runtime as `process.env.PILOT_ADMIN_EMAILS`. This is the authority gate; no DB record defines "admin" status.
2. **Active `approved_email_allowlist` row** — an admin must also be on the allowlist. The allowlist check runs first in `/start`; `PILOT_ADMIN_EMAILS` is checked second. An email in `PILOT_ADMIN_EMAILS` that is not on the active allowlist is denied at the allowlist gate before the admin check runs.

**Sign-in path**: admins use **password-based auth** (not magic link) via:
- `app/(internal)/admin/login/page.tsx` — a dedicated login form, public in middleware
- `app/actions/auth/sign-in-admin.ts` — calls `supabase.auth.signInWithPassword()`
- On success, the client redirects to `/pilot-review`

When a magic-link user signs in normally, `/start` detects `PILOT_ADMIN_EMAILS` membership at line 36 and redirects to `/pilot-review` before the staff binding check.

---

### Admin Guard Implementation

The admin authority check is **implemented in two places with no shared helper**:

| Location                                     | Check                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `app/(public)/start/page.tsx:32–38`          | Inline `PILOT_ADMIN_EMAILS` check — redirects admin to `/pilot-review`                                                           |
| `app/(internal)/pilot-review/page.tsx:34–42` | Inline check — non-admin authenticated users → `/request-access`                                                                 |
| `app/actions/pilot/review-actions.ts:24–51`  | `requirePilotAdminSession()` — local private function, checks `PILOT_ADMIN_EMAILS`, throws `DomainError('PILOT_ADMIN_REQUIRED')` |

Note: `requirePilotAdminSession()` in `review-actions.ts` is **not the same function** as `requireApprovedPilotSession()` in `lib/server-actions/guards/require-approved-pilot-session.ts`. The guard for onboarding actions only checks allowlist, not admin membership.

---

### Implemented Admin Surface: `/pilot-review`

`app/(internal)/pilot-review/` provides the **allowlist management** UI:

| Action      | Server Action              | Effect                                                                                                           |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Approve** | `approvePilotAccessAction` | Upserts `approved_email_allowlist` row (`status: 'active'`), updates `pilot_access_requests.status = 'approved'` |
| **Reject**  | `rejectPilotAccessAction`  | Updates `pilot_access_requests.status = 'rejected'`                                                              |
| **Revoke**  | `revokePilotAccessAction`  | Updates `approved_email_allowlist.status = 'revoked'`                                                            |

`revokePilotAccessAction` is implemented in code but **not wired to the UI** — `pilot-review-table.tsx` only renders Approve and Reject buttons.

---

### The Gap: "Manual Admin Enablement" in the PRD Flow

Your flow diagram shows:

```
/demo → manual admin enablement → operational membership → /pit
```

This step — moving an evaluator off the holding page — is the **demo staff binding** operation. It is **not implemented as any UI or server action**. The current system has:

- **No `/pilot-review` surface for staff binding** — the review page only manages the allowlist (the earlier step)
- **No admin action to insert a `staff` row** — documented only as the SQL runbook in PRD-084 Appendix C
- **No tracking of which approved evaluators have been staff-bound vs. are on the holding page**

So the current admin workflow stops at allowlist approval. The "enablement" step that completes the flow to `/pit` requires a pilot admin to execute raw SQL (`INSERT INTO staff ...`) against the database directly.

---

### Summary: What Admin Can Do Today vs. What PRD-084 Requires

| Capability                                               | Today                    | PRD-084 Scope                          |
| -------------------------------------------------------- | ------------------------ | -------------------------------------- |
| Allowlist approval/rejection UI                          | ✅ Implemented           | In scope (already done)                |
| Allowlist revocation                                     | ✅ Code exists           | In scope (already done, UI not wired)  |
| Admin password login (`/admin/login`)                    | ✅ Implemented           | —                                      |
| Admin shortcut in `/start` → `/pilot-review`             | ✅ Implemented           | —                                      |
| Provisioning auth guard for `/register`/`/bootstrap`     | ❌ Not yet               | **WS3 — to build**                     |
| Staff binding for demo access enablement                 | ❌ SQL only (Appendix C) | Explicitly **out of scope** in PRD-084 |
| `/demo` holding page                                     | ❌ Not yet               | **WS2 — to build**                     |
| `/start` routing update (remove register/bootstrap path) | ❌ Not yet               | **WS1 — to build**                     |

The `start/page.tsx` currently still has the old PRD-083 routing — casino-settings query, `/register`/`/bootstrap` redirect branches — none of which have been removed yet for PRD-084.