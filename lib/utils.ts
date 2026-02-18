import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { FetchError } from '@/lib/http/fetch-json';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// UX-only: used by app/protected/layout.tsx to show <EnvVarWarning /> vs <AuthButton />.
// NOT used for security paths — middleware enforces env presence via fail-loud assertion.
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Extract clean, user-friendly error message from Error objects
 *
 * Handles FetchError by removing technical prefixes and extracting
 * the domain-specific error message.
 *
 * @param error - Error object to extract message from
 * @returns Clean error message suitable for user display
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return 'An unexpected error occurred';

  if (error instanceof FetchError) {
    // FetchError.message already includes the clean domain message
    // Remove "FetchError: " prefix if present
    const message = error.message.replace(/^FetchError:\s*/i, '');
    return message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected error occurred';
}
