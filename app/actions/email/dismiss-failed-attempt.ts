/**
 * Dismiss Failed Email Attempt Server Action
 *
 * Admin-only action to dismiss a failed email send attempt.
 * Records a new attempt row with status 'dismissed' linked to the
 * original chain root via original_attempt_id.
 *
 * @see EXEC-062 WS4 - Server Actions for shift report email
 */
'use server';

import { createEmailProvider } from '@/lib/email';
import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import { createEmailService } from '@/services/email';
import { insertSendAttempt } from '@/services/email/crud';
import type { EmailSendAttemptDto } from '@/services/email/dtos';

/**
 * Dismiss a failed email send attempt.
 *
 * Appends a new row with status 'dismissed' linked to the original
 * attempt chain root.
 *
 * @param attemptId - UUID of the failed send attempt to dismiss
 * @returns ServiceResult with the new dismissed EmailSendAttemptDto
 */
export async function dismissFailedAttemptAction(
  attemptId: string,
): Promise<ServiceResult<EmailSendAttemptDto>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (mwCtx) => {
      const provider = createEmailProvider();
      const emailService = createEmailService(mwCtx.supabase, provider);

      const original = await emailService.getSendAttemptById(attemptId);
      if (!original) {
        return {
          ok: false as const,
          code: 'NOT_FOUND' as const,
          error: 'Send attempt not found',
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }

      const originalAttemptId = original.original_attempt_id ?? original.id;

      const attempt = await insertSendAttempt(mwCtx.supabase, {
        casino_id: original.casino_id,
        recipient_email: original.recipient_email,
        template: original.template,
        status: 'dismissed',
        original_attempt_id: originalAttemptId,
        payload_ref: original.payload_ref,
      });

      return {
        ok: true as const,
        code: 'OK' as const,
        data: attempt,
        requestId: mwCtx.correlationId,
        durationMs: Date.now() - mwCtx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    { domain: 'email', action: 'dismiss-failed-attempt' },
  );
}
