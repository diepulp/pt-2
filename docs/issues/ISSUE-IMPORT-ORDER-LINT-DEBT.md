# ISSUE: Pre-existing import/order ESLint warnings across codebase

**Surfaced**: 2026-06-02, during PRD-090 EXEC-090 WS1 (SRM Preflight)
**Severity**: Non-blocking (pre-existing, never caught by standard gate)
**Status**: Open — deferred, separate concern from PRD-090

---

## Root Cause

The project's standard `npm run lint` script runs with `--quiet` and no `--max-warnings` flag, which means `import/order` warnings are suppressed and exit code is always 0. The EXEC-090 WS1 gate was written as `npm run lint -- --max-warnings=0`, which is stricter than the project standard and surfaced pre-existing warnings for the first time.

```
"lint":       ... eslint --quiet --no-warn-ignored --cache   ← warnings suppressed, always exits 0
"lint:check": ... eslint --no-warn-ignored --max-warnings=0  ← strict (separate script, not used in gates)
```

## Scope

Warnings are `import/order` violations spread across:
- `services/` — multiple service modules and test files
- `components/` — dashboard and shift components
- `hooks/` — various hook files
- `app/` — API route handlers
- `lib/` — utility modules

Pattern of violations:
- `There should be no empty line within import group`
- `X import should occur before import of Y` (ordering within same group)

## Known affected files (sampled, not exhaustive)

From WS1 investigation:
- `services/table-context/__tests__/chip-custody.test.ts`
- `services/table-context/__tests__/drop-events-route-boundary.test.ts`
- `services/table-context/__tests__/http-contract.test.ts`
- Multiple files in `services/`, `components/shift-dashboard*/`, `hooks/`

## Recommended fix

Run `npm run lint:fix` across all source directories to auto-fix import ordering:

```bash
npm run lint:fix
# Then verify:
npm run lint:check
```

Any non-auto-fixable violations (post-mock imports in jest tests, deliberate separations) require `// eslint-disable-next-line import/order` inline suppressions.

## Gate alignment recommendation

Future EXEC-SPEC lint gates should use `npm run lint` (project standard) not `npm run lint -- --max-warnings=0` unless the lint debt has been cleared first. Alternatively, update `"lint"` script in `package.json` to include `--max-warnings=0` once the debt is resolved.

## Resolution path

1. Run `npm run lint:fix` (auto-fix all fixable violations)
2. Manually add `eslint-disable-next-line` for deliberate post-mock imports
3. Verify `npm run lint:check` passes with 0 warnings
4. Update `"lint"` npm script to include `--max-warnings=0` permanently
