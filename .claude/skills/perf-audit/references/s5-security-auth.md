# S5: Security & Auth Flow Analysis

SECURITY AUDIT — Stream S5: Auth & Data Security in UI
Target: {target}
Files: {file_manifest}

Analyze frontend security patterns per ADR-012, ADR-024, ADR-030.
For each finding, provide: Severity (P0-P4), file:line reference, evidence, remediation.

## Checklist

### Auth Context in UI
- [ ] Verify auth state is derived from authoritative source (not localStorage alone)
- [ ] Check for user ID/casino ID exposed in URL params that could be spoofed
- [ ] Verify no sensitive data in client-side state that survives logout
- [ ] Check for proper auth error handling (redirect to login on 401)

### Data Exposure
- [ ] Check for casino_id or staff_id passed as query parameters from UI
- [ ] Verify no cross-tenant data leakage in shared stores
- [ ] Check for PII displayed without proper authorization checks
- [ ] Verify error messages do not leak internal details (table names, SQL)

### RLS Compliance in Data Flow
- [ ] Verify all data-fetching hooks go through authenticated Supabase client
- [ ] Check for direct table access that bypasses RPC context injection
- [ ] Verify casino scoping on all displayed data
- [ ] Check for any service_role key usage in client-side code

### ADR-030 UI Compliance
- [ ] Verify no skipAuth patterns in frontend code
- [ ] Check that auth bypass (DEV_AUTH_BYPASS) is properly gated
- [ ] Verify session refresh handling on token expiry
- [ ] Check for proper CSRF protection on mutations

## Output Format

Structured findings list with severity, file:line, evidence, remediation.
Label each finding S5-{N} (e.g., S5-1, S5-2, ...).
