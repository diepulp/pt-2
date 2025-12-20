# Error Handling Standard

> **Status:** Active
> **Last Updated:** 2025-12-20
> **Category:** GOV (Governance)

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

## Related Documents

- `docs/20-architecture/specs/ERROR_TAXONOMY_AND_RESILIENCE.md` - Error classification
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
| 1.0 | 2025-12-20 | Initial standard created |
