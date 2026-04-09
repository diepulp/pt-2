import * as Sentry from '@sentry/nextjs';

import { beforeSend } from '@/lib/sentry/pii-denylist';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment:
    process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // Capture 100% of errors during pilot (low traffic)
  sampleRate: 1.0,

  // RULE-5: No tracing, no replay, no performance monitoring
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // PII redaction — denylist scrubbing as secondary guard (RULE-2)
  beforeSend,

  // Minimal capture — prefer not attaching extras/contexts by default
  attachStacktrace: true,

  // Graceful degradation — if DSN is absent, Sentry stays disabled
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
