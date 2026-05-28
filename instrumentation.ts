import type { Instrumentation } from 'next';

function isSentryEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.CI === 'true' ||
    process.env.ENABLE_SENTRY_IN_DEV === 'true'
  );
}

export async function register() {
  if (!isSentryEnabled()) {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.server.config');
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  if (!isSentryEnabled()) {
    return;
  }

  const Sentry = await import('@sentry/nextjs');
  return Sentry.captureRequestError(...args);
};
