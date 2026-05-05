That's the complete answer. Here's the full picture:

---

## Why the App Worked: The `hasEnvVars` Bypass (Historical)

Before commit `b5ca17ff` (Feb 18, 2026), the middleware had this:

```typescript
// Old code — before the fix
import { hasEnvVars } from '../utils';

if (!hasEnvVars) {
  return supabaseResponse;  // silently pass all requests through
}
```

`hasEnvVars` was checking `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` (a variable that never existed), making it permanently `false`. This means the middleware **always bypassed auth checks on every request** — unauthenticated users could access any route, and there were no 500s regardless of env var state. The bypass was intended as a dev-time scaffold but was never removed and had a wrong variable name that masked it entirely.

That fix is already shipped (Feb 18). Any deployment after that commit has the fail-loud 500 guard.

---

## Why You Could "Log In" Today

**You were on a Production-tagged Vercel URL, not a Preview.** The `vercel ls` output shows Production deployments with hash-style URLs (`pt-2-aa9n1mcks-...`, `pt-2-ltb6v4igw-...`) that are visually identical to Preview URLs. Production has all five env vars set — Supabase auth works normally on them.

Current Preview deployments (post-Feb-18 code + missing Supabase vars) return HTTP 500 on every request including the login page. You cannot access any page on a real Preview URL today.

---

## Revised Posture Doc Finding

The posture doc statement "every page that calls `createBrowserClient()` fails" is outdated — it describes the pre-`b5ca17ff` behavior. The current failure mode on Preview is harsher: middleware returns 500 before any page code runs. Fix A (add the three Supabase vars to the Preview environment) is still the correct fix.