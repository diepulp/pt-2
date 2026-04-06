# Supabase Dashboard Remediations

**Source:** [Supabase Advisor Report 2026-04-02](./SUPABASE-ADVISOR-REPORT-2026-04-02.md)  
**Created:** 2026-04-03  
**Status:** Pending

These issues require manual action in the Supabase Dashboard and cannot be resolved via SQL migrations.

---

## SEC-S6: Enable Leaked Password Protection

**Severity:** WARN  
**Risk:** Users can sign up with known-compromised passwords. Supabase checks credentials against the HaveIBeenPwned database when this is enabled.

**Steps:**
1. Open the Supabase Dashboard for project `vaicxfihdldgepzryhpd`.
2. Navigate to **Authentication > URL Configuration** (or **Auth > Settings** depending on dashboard version).
3. Under **Password Protection**, enable **Leaked password protection**.
4. Save changes.

**Reference:** https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

---

## SEC-S7: Enable Additional MFA Methods

**Severity:** WARN  
**Risk:** Too few MFA methods are enabled, weakening account security posture.

**Steps:**
1. Open the Supabase Dashboard for project `vaicxfihdldgepzryhpd`.
2. Navigate to **Authentication > Multi-Factor Authentication**.
3. Enable **TOTP** (Time-based One-Time Password) if not already enabled.
4. Enable **WebAuthn** (passkey/hardware key) for stronger phishing-resistant MFA.
5. Save changes.

**Reference:** https://supabase.com/docs/guides/auth/auth-mfa

---

## SEC-S8: Upgrade Vulnerable Postgres Version

**Severity:** WARN  
**Risk:** Current version `supabase-postgres-17.4.1.074` has outstanding security patches.

**Steps:**
1. Open the Supabase Dashboard for project `vaicxfihdldgepzryhpd`.
2. Navigate to **Settings > Infrastructure**.
3. Check for available Postgres version upgrades.
4. If an upgrade is available, follow the guided upgrade flow.
5. **Before upgrading:** Ensure a recent backup exists (Project Settings > Database > Backups).
6. **After upgrading:** Run the Supabase Database Advisor again to verify SEC-S8 is resolved.

**Reference:** https://supabase.com/docs/guides/platform/upgrading

---

## Verification Checklist

- [ ] SEC-S6: Leaked password protection enabled
- [ ] SEC-S7: TOTP MFA enabled
- [ ] SEC-S7: WebAuthn MFA enabled
- [ ] SEC-S8: Postgres version upgraded past `17.4.1.074`
- [ ] Re-run Supabase Database Advisor to confirm all WARN items resolved
