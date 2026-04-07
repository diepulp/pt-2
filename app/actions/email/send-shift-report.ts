/**
 * Send Shift Report Email Server Action
 *
 * Wires EmailService.sendShiftReport to the shift-close flow.
 * Sends email to each recipient via the configured provider and
 * logs each attempt to email_send_attempt.
 *
 * @see EXEC-062 WS4 - Server Actions for shift report email
 */
'use server';

import { createEmailProvider } from '@/lib/email';
import type { ServiceResult } from '@/lib/http/service-response';
import { withServerAction } from '@/lib/server-actions/middleware/compositor';
import { createClient } from '@/lib/supabase/server';
import { createEmailService } from '@/services/email';
import type { EmailSendResult } from '@/services/email/dtos';

/**
 * Send a shift report email to the specified recipients.
 *
 * @param shiftId - Shift UUID
 * @param recipients - Array of email addresses
 * @param reportDate - ISO date string (YYYY-MM-DD)
 * @returns ServiceResult with EmailSendResult payload
 */
export async function sendShiftReportAction(
  shiftId: string,
  recipients: string[],
  reportDate: string,
): Promise<ServiceResult<EmailSendResult>> {
  const supabase = await createClient();

  return withServerAction(
    supabase,
    async (mwCtx) => {
      const provider = createEmailProvider();
      const emailService = createEmailService(mwCtx.supabase, provider);

      const result = await emailService.sendShiftReport({
        casinoId: mwCtx.rlsContext!.casinoId,
        shiftId,
        recipients,
        reportDate,
      });

      return {
        ok: result.success,
        code: result.success ? ('OK' as const) : ('INTERNAL_ERROR' as const),
        data: result,
        requestId: mwCtx.correlationId,
        durationMs: Date.now() - mwCtx.startedAt,
        timestamp: new Date().toISOString(),
      };
    },
    { domain: 'email', action: 'send-shift-report' },
  );
}
