1. Open one PR: ci/wave-2-gate-refresh

Do not split this into phase PRs. These are shared gate fixes, and splitting them will create stupid cross-PR failures. Put the CI/security-gate refresh in one isolated PR before merging the Wave 2 tree.

2. Fix the two hard blockers first

Patch these together:

10_authenticated_grant_audit.sql
06_context_first_line_check.sql

Both are failing for the same reason: Wave 2 introduced 11 service_role-only relay/lifecycle RPCs, but the old gates still expect every rpc_* to be authenticated-user callable and staff-context injected. The triage says SEC-010 needs those 11 RPCs added to v_exclusions, and SEC-006 needs the same 11 added to the context-injection allowlist.

This is not weakening security. It is making the gate understand the new security model. Authenticated users should not get access to relay internals.

3. Register the missing outbox transport access gate — but convert it first

outbox_transport_access.test.sql exists, but it is not registered in run_all_gates.sh, so CI never runs it. Worse: it is pgTAP-style, and the current runner relies on psql exit codes; pgTAP failures can emit TAP output without failing the shell step. So simply adding it to the array is fake safety. Convert it to RAISE EXCEPTION / RAISE NOTICE 'PASS: ...' style first, then register it as a new SEC gate.

That one is worth doing before merge because Wave 2’s whole posture depends on finance_outbox and processed_messages not being casually readable/writable by authenticated.

4. Add a lint exemption convention, not a giant brittle hack

migration-lint.yml currently has no concept of service-role-only RPCs, so future relay RPC edits will get blocked for not calling set_rls_context_from_staff() or set_rls_context_internal().

I would avoid a huge hardcoded list if possible. Use a deliberate marker convention:

-- service_role_only_rpc: ADR-054 R3

Then the lint can allow missing staff-context injection only when that explicit marker is present near the function definition. That gives you reviewable intent instead of letting random RPCs dodge the rule.

5. Leave continue-on-error: true alone until env isolation is fixed

Do not harden the CI test job yet. The file notes the .env vs .env.local problem can cause integration tests to hit the remote DB instead of local. That is not a test-hardening problem; that is a loaded gun on the table.

Sequence should be:

repair security gates,
make outbox access gate executable in CI,
fix local-vs-remote Supabase env resolution,
then flip continue-on-error: false.

Otherwise you’ll get noisy red CI and possibly unsafe test execution. Very on-brand, but not helpful.

6. Keep this PR brutally scoped

Suggested PR checklist:

## CI Wave 2 Gate Refresh

- [ ] SEC-010 excludes service_role-only outbox/relay/lifecycle RPCs
- [ ] SEC-006 allowlists service_role-only SECURITY DEFINER outbox RPCs
- [ ] outbox transport access test converted from pgTAP to exception-based gate
- [ ] outbox transport access gate registered in run_all_gates.sh
- [ ] migration lint supports explicit service-role-only RPC exemption marker
- [ ] ci.yml stale test-count comment updated
- [ ] continue-on-error left unchanged pending env isolation fix

Bottom line: yes, fix this before opening the main Wave 2 PR. This is not scope creep; this is the bouncer finally learning the guest list changed.