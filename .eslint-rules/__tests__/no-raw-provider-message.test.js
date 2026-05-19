/**
 * Tests for ESLint rule: no-raw-provider-message
 *
 * Verifies PRD-081 WS4 enforcement — raw provider error fields must not
 * cross user-visible or client-thrown boundaries.
 *
 * Test structure follows the RuleTester pattern used across PT-2 custom rules.
 * Each section documents WHY the code is valid or invalid, not just what it is.
 */

'use strict';

const { RuleTester } = require('eslint');
const rule = require('../no-raw-provider-message');

// ---------------------------------------------------------------------------
// RuleTester configuration
// ---------------------------------------------------------------------------
// ESLint v9 RuleTester accepts languageOptions.  We enable JSX and modern
// ECMAScript so all test cases parse correctly.
const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------
// The rule scopes itself to 'use client' files and hooks/**.
// We use these filenames in test cases to ensure correct scoping.
const CLIENT_FILE = '/home/project/hooks/use-something.ts';
const NON_CLIENT_FILE = '/home/project/services/player/crud.ts';

ruleTester.run('no-raw-provider-message', rule, {
  // =========================================================================
  // VALID — should NOT flag
  // =========================================================================
  valid: [
    // -----------------------------------------------------------------------
    // Sanitizer wrappers — already safe, no flag
    // -----------------------------------------------------------------------
    {
      name: 'throw normalizeClientError(error) — already normalized',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(error) {
          throw normalizeClientError(error);
        }
      `,
    },
    {
      name: 'toast.error(getErrorMessage(error)) — already sanitized',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(error) {
          toast.error(getErrorMessage(error));
        }
      `,
    },
    {
      name: 'toast.error description uses getErrorMessage — safe',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(error) {
          toast.error('Failed', { description: getErrorMessage(error) });
        }
      `,
    },
    {
      name: 'logError call — not user-visible, do not flag',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(error) {
          logError(error, { context: 'upload' });
        }
      `,
    },

    // -----------------------------------------------------------------------
    // String literals — controlled by the developer, not provider data
    // -----------------------------------------------------------------------
    {
      name: 'throw new Error with string literal — safe',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo() {
          throw new Error('Something went wrong');
        }
      `,
    },
    {
      name: 'toast.error with string literal — safe',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo() {
          toast.error('Upload failed');
        }
      `,
    },

    // -----------------------------------------------------------------------
    // Domain objects — .message on non-error named variables should not flag
    // -----------------------------------------------------------------------
    {
      name: 'toast.error(result.message) — result is a domain object, not provider error',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(result) {
          toast.error(result.message, { duration: 3000 });
        }
      `,
    },
    {
      name: 'toast.error(alert.message) — alert is a DTO field, not provider error',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(alert) {
          toast.error(alert.message);
        }
      `,
    },
    {
      name: 'JSX {item.message} — item is a domain object',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function Comp({ item }) {
          return <p>{item.message}</p>;
        }
      `,
    },

    // -----------------------------------------------------------------------
    // Non-client files — rule should not apply
    // -----------------------------------------------------------------------
    {
      name: 'throw new Error(error.message) in server-side service file — not client',
      filename: NON_CLIENT_FILE,
      code: `
        function foo(error) {
          throw new Error(error.message);
        }
      `,
    },
    {
      name: 'toast.error(error.message) in file without use client — not flagged',
      filename: NON_CLIENT_FILE,
      code: `
        function foo(error) {
          toast.error(error.message);
        }
      `,
    },

    // -----------------------------------------------------------------------
    // Test files — explicitly skipped by the rule
    // -----------------------------------------------------------------------
    {
      name: 'test file — skip by filename heuristic',
      filename: '/home/project/hooks/use-something.test.ts',
      code: `
        'use client';
        test('should handle errors', () => {
          expect(() => { throw new Error(error.message); }).toThrow();
        });
      `,
    },

    // -----------------------------------------------------------------------
    // normalize-client-error.ts itself — skip (it IS the sanitizer)
    // -----------------------------------------------------------------------
    {
      name: 'normalize-client-error.ts itself — skipped',
      filename: '/home/project/lib/errors/normalize-client-error.ts',
      code: `
        'use client';
        function normalizeClientError(error) {
          return new Error(error.message ?? 'Unknown error');
        }
      `,
    },

    // -----------------------------------------------------------------------
    // error-utils.ts — skipped
    // -----------------------------------------------------------------------
    {
      name: 'error-utils.ts — skipped',
      filename: '/home/project/lib/errors/error-utils.ts',
      code: `
        'use client';
        export function getErrorMessage(error) {
          return error.message ?? 'Unknown error';
        }
      `,
    },

    // -----------------------------------------------------------------------
    // instanceof guard — err.message after instanceof Error is a custom error
    // class message (controlled by the developer), but since 'err' is in the
    // PROVIDER_ERROR_NAMES set this WILL be flagged when in the four positions.
    // This case uses a variable name NOT in the provider error names set.
    // -----------------------------------------------------------------------
    {
      name: 'customErr.message — customErr not in provider error name set',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(customErr) {
          toast.error('Failed', { description: customErr.message });
        }
      `,
    },

    // -----------------------------------------------------------------------
    // hooks/ path without 'use client' — still applies (hooks are always client)
    // But if the variable name is safe (not in provider error set), no flag.
    // -----------------------------------------------------------------------
    {
      name: 'hooks path, domain object name — no flag',
      filename: '/home/project/hooks/use-data.ts',
      code: `
        function foo(response) {
          toast.error(response.message);
        }
      `,
    },
  ],

  // =========================================================================
  // INVALID — should flag with rawProviderMessage
  // =========================================================================
  invalid: [
    // -----------------------------------------------------------------------
    // Pattern 1: throw new Error(error.message)
    // -----------------------------------------------------------------------
    {
      name: 'throw new Error(error.message) in use client file — flagged',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(error) {
          throw new Error(error.message);
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'error.message' },
        },
      ],
    },
    {
      name: 'throw new Error(err.message) — err is a provider error name',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(err) {
          throw new Error(err.message);
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'err.message' },
        },
      ],
    },
    {
      name: 'throw new Error(error.hint) — hint is a provider diagnostic field',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(error) {
          throw new Error(error.hint);
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'error.hint' },
        },
      ],
    },

    // -----------------------------------------------------------------------
    // Pattern 1b: throw new Error with template literal
    // -----------------------------------------------------------------------
    {
      name: 'throw new Error(`Failed: ${error.message}`) — template literal',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(error) {
          throw new Error(\`Failed: \${error.message}\`);
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'error.message' },
        },
      ],
    },
    {
      name: 'throw new Error template with err.details — details is a provider field',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(err) {
          throw new Error(\`Operation failed: \${err.details}\`);
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'err.details' },
        },
      ],
    },

    // -----------------------------------------------------------------------
    // Pattern 2: toast.error(error.message) — direct first argument
    // -----------------------------------------------------------------------
    {
      name: 'toast.error(error.message) — direct provider field as toast text',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(error) {
          toast.error(error.message);
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'error.message' },
        },
      ],
    },
    {
      name: 'toast.error(err.hint) — hint field as toast text',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(err) {
          toast.error(err.hint);
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'err.hint' },
        },
      ],
    },

    // -----------------------------------------------------------------------
    // Pattern 3: toast.error with description: error.hint
    // -----------------------------------------------------------------------
    {
      name: 'toast.error description with error.hint — provider field as description',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(error) {
          toast.error('Failed', { description: error.hint });
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'error.hint' },
        },
      ],
    },
    {
      name: 'toast.error description with error.message — provider field',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(error) {
          toast.error('Save failed', { description: error.message });
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'error.message' },
        },
      ],
    },
    {
      name: 'toast.error description with e.details — short name',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function foo(e) {
          toast.error('Error occurred', { description: e.details });
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'e.details' },
        },
      ],
    },

    // -----------------------------------------------------------------------
    // Pattern 4: JSX expression — {error.message} as child or prop
    // -----------------------------------------------------------------------
    {
      name: 'JSX child {error.message} — raw provider field in render output',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function Comp({ error }) {
          return <p>{error.message}</p>;
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'error.message' },
        },
      ],
    },
    {
      name: 'JSX prop title={`Realtime error: ${error.message}`} — template in prop',
      filename: CLIENT_FILE,
      code: `
        'use client';
        function Comp({ error }) {
          return <div title={\`Realtime error: \${error.message}\`} />;
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'error.message' },
        },
      ],
    },

    // -----------------------------------------------------------------------
    // hooks/ path (no 'use client' needed — hooks are always client-side)
    // -----------------------------------------------------------------------
    {
      name: 'hooks path without use client directive — still applies',
      filename: '/home/project/hooks/use-data.ts',
      code: `
        function foo(error) {
          throw new Error(error.message);
        }
      `,
      errors: [
        {
          messageId: 'rawProviderMessage',
          data: { source: 'error.message' },
        },
      ],
    },
  ],
});

console.log('no-raw-provider-message: all tests passed');
