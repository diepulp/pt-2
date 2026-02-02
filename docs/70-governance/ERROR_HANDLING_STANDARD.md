# Error Handling Standard

> **Status:** Active
> **Last Updated:** 2026-02-02
> **Category:** GOV (Governance)
> **Extends:** ADR-012 (Error Handling Layers), ADR-032 (Frontend Error Boundary Architecture)

## Overview

This document defines the standardized error handling patterns for PT-2 React components. All client-side error handling MUST follow these patterns to ensure consistent user experience and proper debugging capabilities.

## Core Utilities

All error handling utilities are centralized in `lib/errors/error-utils.ts`.

### Available Functions

| Function | Purpose |
|----------|---------|
| `logError()` | Structured error logging (dev only) |
| `getErrorMessage()` | Extract user-friendly message |
| `formatValidationError()` | Format validation errors for display |
| `isFetchError()` | Type guard for FetchError |
| `isValidationError()` | Check if validation error |
| `isConflictError()` | Check if conflict/duplicate error |
| `isNotFoundError()` | Check if not found error |
| `isRetryableError()` | Check if error is retryable |
| `serializeError()` | Convert error to loggable object |

## The Empty Object Problem

JavaScript Error objects have non-enumerable properties (`message`, `name`, `stack`). This causes:

```javascript
// BAD - Shows {} in console
console.error('Error:', { message: err.message, ...err });

// GOOD - Shows full error details
logError(err, { component: 'MyComponent', action: 'save' });
```

The `serializeError()` function explicitly extracts all error properties for proper logging.

## Standard Pattern for React Components

### Mutation Error Handling (TanStack Query)

```typescript
import {
  logError,
  getErrorMessage,
  formatValidationError,
  isFetchError,
  isValidationError,
} from "@/lib/errors/error-utils";

const mutation = useMutation({
  mutationFn: async (input) => { /* ... */ },
  onError: (err: Error) => {
    // 1. Structured logging (dev only, properly serialized)
    logError(err, { component: 'ComponentName', action: 'actionName' });

    // 2. Handle specific error codes
    if (isFetchError(err) && err.code === 'SPECIFIC_ERROR_CODE') {
      setError("Custom user-friendly message for this specific case");
    }
    // 3. Handle validation errors with field details
    else if (isValidationError(err)) {
      setError(formatValidationError(err));
    }
    // 4. Fallback to clean user message
    else {
      setError(getErrorMessage(err));
    }
  },
});
```

### Try-Catch Error Handling

```typescript
try {
  await someAsyncOperation();
} catch (err) {
  // 1. Log with context
  logError(err, {
    component: 'ComponentName',
    action: 'operationName',
    metadata: { relevantId: id }  // Optional extra context
  });

  // 2. Handle and display
  if (isValidationError(err)) {
    setError(formatValidationError(err));
  } else {
    setError(getErrorMessage(err));
  }
}
```

## Error Context Structure

The `ErrorContext` interface:

```typescript
interface ErrorContext {
  component: string;  // Component name (e.g., 'NewSlipModal')
  action: string;     // Action being performed (e.g., 'createSlip')
  metadata?: Record<string, unknown>;  // Optional extra data
}
```

## Console Output Format

The `logError()` function produces output like:

```
[NewSlipModal] createSlip Error: {
  name: "FetchError",
  message: "Seat already occupied",
  code: "SEAT_ALREADY_OCCUPIED",
  status: 409,
  details: { seat_number: "3" }
}
```

## Rules

### DO

- Use `logError()` for all error logging in React components
- Use `getErrorMessage()` for user-facing error messages
- Use `formatValidationError()` for validation errors
- Use type guards (`isFetchError`, `isValidationError`, etc.) instead of `instanceof`
- Include meaningful component and action names in error context

### DO NOT

- Use raw `console.error()` with error objects (shows `{}`)
- Spread error objects directly (`...err`)
- Log in production (handled automatically by `logError()`)
- Use `instanceof FetchError` directly (use `isFetchError()`)
- Create custom formatters (use `formatValidationError()`)

## Migration Guide

To migrate existing components:

1. **Update imports:**
   ```typescript
   // Before
   import { FetchError } from "@/lib/http/fetch-json";
   import { getErrorMessage } from "@/lib/utils";

   // After
   import {
     logError,
     getErrorMessage,
     formatValidationError,
     isFetchError,
     isValidationError,
   } from "@/lib/errors/error-utils";
   ```

2. **Replace console.error:**
   ```typescript
   // Before
   console.error('[Component] Error:', { message: err.message });

   // After
   logError(err, { component: 'Component', action: 'action' });
   ```

3. **Replace instanceof checks:**
   ```typescript
   // Before
   if (err instanceof FetchError && err.code === 'VALIDATION_ERROR')

   // After
   if (isValidationError(err))
   ```

4. **Remove local formatValidationError functions** - use the centralized one.

## React Error Boundaries (ADR-032)

Errors that occur **during React rendering** — outside the `ServiceResult<T>` pipeline — are caught by a three-tier error boundary hierarchy. Error boundaries use the **same utilities** defined above (`logError()`, `getErrorMessage()`, `isRetryableError()`, `isAuthError()`).

### Three-Tier Hierarchy

| Tier | Mechanism | Scope | Recovery |
|------|-----------|-------|----------|
| 1 | Next.js `error.tsx` | Entire route segment | `reset()` re-renders segment |
| 2 | `PanelErrorBoundary` | Individual layout panel | Reset panel + invalidate queries |
| 3 | `QueryErrorResetBoundary` | Query-dependent subtree | Retry failed queries |

### Error Types Caught

- Null dereferences in render (`player.name` when `player` is `undefined`)
- Malformed data in JSX (array method on non-array query result)
- Browser API failures (`NotAllowedError` from clipboard, etc.)
- Zustand selector crashes (store shape changes)
- Component lifecycle errors (`useEffect` cleanup throws)

### Invariants (ADR-032)

- **INV-032-1**: Error boundaries MUST NOT use raw `console.error()`. Use `logError()` only.
- **INV-032-2**: Error boundaries MUST NOT swallow errors silently. Every caught error produces a `logError()` call and a visible UI state change.
- **INV-032-3**: `isAuthError(error)` MUST trigger navigation to login, not an error UI.

### Standard Pattern

```typescript
// In PanelErrorBoundary.componentDidCatch:
logError(error, {
  component: `PanelErrorBoundary:${panelName}`,
  action: 'render-error',
  metadata: {
    digest: error.digest,
    componentStack: errorInfo?.componentStack?.slice(0, 500),
  },
});
```

**Components**: `components/error-boundary/error-state.tsx`, `components/error-boundary/panel-error-boundary.tsx`
**ADR**: `docs/80-adrs/ADR-032-frontend-error-boundary-architecture.md`

## Related Documents

- `docs/80-adrs/ADR-032-frontend-error-boundary-architecture.md` - Error boundary architecture (extends ADR-012)
- `docs/80-adrs/ADR-012-error-handling-layers.md` - Error handling layers (DomainError vs ServiceResult)
- `docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md` - Error classification
- `lib/errors/domain-errors.ts` - Domain error codes and messages
- `lib/http/fetch-json.ts` - FetchError class definition
- `lib/errors/retry-policy.ts` - Retry logic for transient failures

## Affected Components

All components migrated to use standardized error handling:

| Component | Status | Pattern Used |
|-----------|--------|--------------|
| `components/dashboard/new-slip-modal.tsx` | DONE | `logError()`, `getErrorMessage()`, `formatValidationError()` |
| `components/dashboard/pit-dashboard-client.tsx` | DONE | `logError()` |
| `components/pit-panels/pit-panels-client.tsx` | DONE | `logError()` |
| `components/login-form.tsx` | DONE | `getErrorMessage()` |
| `components/sign-up-form.tsx` | DONE | `getErrorMessage()` |
| `components/forgot-password-form.tsx` | DONE | `getErrorMessage()` |
| `components/update-password-form.tsx` | DONE | `getErrorMessage()` |
| `components/landing-page/sections/contact-section.tsx` | N/A | Uses Zod validation (correct pattern) |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1 | 2026-02-02 | Added React Error Boundaries section (ADR-032), updated Related Documents |
| 1.0 | 2025-12-20 | Initial standard created |
