# ISSUE: Setup Wizard Passes Invalid Template Name to Seed RPC

| Field            | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| **ID**           | SETUP-WIZARD-SEED-TEMPLATE-MISMATCH                      |
| **Severity**     | Blocker                                                   |
| **Status**       | Remediated                                                |
| **Discovered**   | 2026-02-11 (PRD-030 WS5 E2E testing)                     |
| **Affected File** | `app/(onboarding)/setup/setup-wizard.tsx:109`            |
| **RPC**          | `rpc_seed_game_settings_defaults` (PRD-029)               |

## Symptom

Setup Wizard Step 1 (Game Settings) fails with:

```
INVALID_TEMPLATE: unknown template "standard"
```

Clicking "Seed Default Games" raises a server error and blocks wizard progression for all users.

## Root Cause

The `setup-wizard.tsx` component passed `{ template: 'standard' }` to the `seedGameSettingsAction` server action, but the RPC `rpc_seed_game_settings_defaults` (created in PRD-029) only accepts `'small_pit_starter'` as a valid template name.

**RPC validation gate** (`20260210081120_prd029_rpc_seed_game_settings_defaults.sql`):

```sql
IF p_template != 'small_pit_starter' THEN
  RAISE EXCEPTION 'INVALID_TEMPLATE: unknown template "%"', p_template;
END IF;
```

The mismatch occurred because `setup-wizard.tsx` (PRD-030 WS3) was authored against an assumed template name `'standard'` that was never defined in the RPC contract (PRD-029 WS1).

## Remediation Applied

Single-line fix in `app/(onboarding)/setup/setup-wizard.tsx:109`:

```diff
- const result = await seedGameSettingsAction({ template: 'standard' });
+ const result = await seedGameSettingsAction({ template: 'small_pit_starter' });
```

No migration required. No schema change.

## Impact Analysis

| Scope              | Impact                                              |
| ------------------ | --------------------------------------------------- |
| Setup Wizard       | Step 1 blocked — no games seeded                    |
| Downstream steps   | Steps 2-4 unreachable (wizard is sequential)        |
| Existing casinos   | None — only affects first-time setup flow            |
| Data integrity     | None — RPC rejected the call, no partial writes      |

## Prevention

The template name should be validated at the schema/types layer rather than relying on runtime string matching. Potential improvements:

1. **Zod schema** in `services/casino/schemas.ts` — enumerate valid template names as a literal union
2. **TypeScript const** — export the accepted template names from the seed action module so the UI imports the value rather than hardcoding a string

## Verification

E2E Full Flow test passes end-to-end after fix, completing all 5 wizard steps including the seed operation.
