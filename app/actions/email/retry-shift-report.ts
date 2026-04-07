/**
 * Retry Shift Report Email Server Action
 *
 * Admin-only retry for a previously failed email send attempt.
 * Reads the original attempt, re-sends via the provider, and logs
 * the retry as a new attempt linked to the original via original_attempt_id.
 *
 * @see EXEC-062 WS4 - Server Actions for shift report email
 */
'use server';

import { createEmailProvider } from '@/lib/email';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import { createEmailService } from '@/services/email';
import { insertSendAttempt } from '@/services/email/crud';
import type { EmailSendAttemptDto } from '@/services/email/dtos';

/**
 * Retry sending a previously failed shift report email.
 *
 * Fetches the original attempt, re-sends, and records the new attempt
 * with a reference back to the original chain root.
 *
 * @param attemptId - UUID of the original send attempt to retry
 * @returns ServiceResult with the new EmailSendAttemptDto
 */
export async function retryShiftReportAction(
  attemptId: string,
): Promise<ServiceResult<EmailSendAttemptDto>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (mwCtx) => {
      const provider = createEmailProvider();
      const emailService = createEmailService(mwCtx.supabase, provider);

      // Fetch the original attempt
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

      // Determine the root attempt ID for chain linking
      const originalAttemptId = original.original_attempt_id ?? original.id;

      // Re-send the email
      try {
        const { messageId } = await provider.send({
          to: original.recipient_email,
          subject: 'Shift Report (Retry)',
          html: `<h1>Shift Report (Retry)</h1><p>Original attempt: ${originalAttemptId}</p>`,
        });

        const attempt = await insertSendAttempt(mwCtx.supabase, {
          casino_id: original.casino_id,
          recipient_email: original.recipient_email,
          template: original.template,
          status: 'sent',
          provider_message_id: messageId,
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
      } catch (err) {
        const errorSummary = String(safeErrorDetails(err));

        const attempt = await insertSendAttempt(mwCtx.supabase, {
          casino_id: original.casino_id,
          recipient_email: original.recipient_email,
          template: original.template,
          status: 'failed',
          error_summary: errorSummary,
          original_attempt_id: originalAttemptId,
          payload_ref: original.payload_ref,
        });

        return {
          ok: false as const,
          code: 'INTERNAL_ERROR' as const,
          data: attempt,
          error: errorSummary,
          requestId: mwCtx.correlationId,
          durationMs: Date.now() - mwCtx.startedAt,
          timestamp: new Date().toISOString(),
        };
      }
    },
    { domain: 'email', action: 'retry-shift-report' },
  );
}
