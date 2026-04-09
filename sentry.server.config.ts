import * as Sentry from '@sentry/nextjs';

import { beforeSend } from '@/lib/sentry/pii-denylist';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,

  environment:
    process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

  release: process.env.VERCEL_GIT_COMMIT_SHA,

  // Capture 100% of errors during pilot (low traffic)
  sampleRate: 1.0,

  // RULE-5: No tracing, no performance monitoring
  tracesSampleRate: 0,

  // PII redaction — denylist scrubbing as secondary guard (RULE-2)
  beforeSend,

  // Minimal capture
  attachStacktrace: true,

  // Graceful degradation — if no DSN, Sentry stays disabled
  enabled: !!dsn,
});
