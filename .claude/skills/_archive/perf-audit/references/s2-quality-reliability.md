# S2: Quality & Reliability Analysis

QUALITY AUDIT — Stream S2: Quality & Reliability
Target: {target}
Files: {file_manifest}

Analyze the following dimensions. For each finding, provide:
- Severity (P0-P4), file:line reference, evidence, remediation.

## Checklist

### Error Handling
- [ ] Check for error boundaries (error.tsx at route level, per-panel boundaries)
- [ ] Verify all async operations have error handling (try/catch or onError)
- [ ] Check for unguarded browser API calls (clipboard, localStorage, navigator)
- [ ] Verify null/undefined guards on data from hooks before render
- [ ] Check for missing loading states (Suspense boundaries, skeleton UI)

### Input Validation
- [ ] Verify route params are validated before use (UUID format, etc.)
- [ ] Check for XSS vectors in user-provided content rendered in JSX
- [ ] Verify search inputs are sanitized before API calls
- [ ] Check for path traversal in dynamic route segments

### Test Coverage
- [ ] Identify orchestration components with zero test coverage
- [ ] Check for tautological test assertions (if visible then expect visible)
- [ ] Verify E2E tests fail when auth is unavailable
- [ ] Check for missing integration tests on complex hook compositions
- [ ] Identify critical user flows without E2E coverage

### Data Integrity
- [ ] Check for cross-entity state leaks (e.g., filters persisting across navigations)
- [ ] Verify optimistic updates have proper rollback on failure
- [ ] Check for race conditions in concurrent data fetching
- [ ] Verify pagination/infinite scroll handles edge cases (empty, error, stale)

### Component Lifecycle
- [ ] Check for memory leaks (subscriptions not cleaned up in useEffect return)
- [ ] Verify abort controllers on fetch operations
- [ ] Check for state updates on unmounted components
- [ ] Verify modals/dialogs properly clean up when closed

### Runtime Quality (if --live=URL is provided)

If a live URL was provided, also perform:
- Navigate to the live URL and verify no console errors on page load
- Test keyboard navigation through all interactive elements
- Verify loading/error/empty states render correctly

## Output Format

Structured findings list with severity, file:line, evidence, impact, remediation.
Label each finding S2-{N} (e.g., S2-1, S2-2, ...).
