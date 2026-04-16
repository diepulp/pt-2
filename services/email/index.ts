import type { SupabaseClient } from '@supabase/supabase-js';

import type { EmailProvider } from '@/lib/email';
import { DomainError } from '@/lib/errors/domain-errors';
import { safeErrorDetails } from '@/lib/errors/safe-error-details';
import type { Database } from '@/types/database.types';

import * as crud from './crud';
import type {
  EmailSendAttemptDto,
  EmailSendResult,
  ShiftReportEmailInput,
} from './dtos';

export interface EmailServiceInterface {
  sendShiftReport(input: ShiftReportEmailInput): Promise<EmailSendResult>;
  getSendAttempts(): Promise<EmailSendAttemptDto[]>;
  getFailedAttempts(): Promise<EmailSendAttemptDto[]>;
  getSendAttemptById(id: string): Promise<EmailSendAttemptDto | null>;
}

export function createEmailService(
  supabase: SupabaseClient<Database>,
  provider: EmailProvider,
): EmailServiceInterface {
  return {
    async sendShiftReport(input) {
      const { casinoId, shiftId, recipients, reportDate, attachment } = input;
      const attemptIds: string[] = [];
      const failures: Array<{ recipient: string; error: string }> = [];

      const subject = `Shift Report - ${reportDate}`;
      const html = `<h1>Shift Report</h1><p>Shift ID: ${shiftId}</p><p>Date: ${reportDate}</p><p>Casino: ${casinoId}</p>`;

      // Build attachments array if PDF attachment provided (EXEC-065 WS4)
      const attachments = attachment
        ? [
            {
              filename: attachment.filename,
              content: attachment.content,
              contentType: attachment.contentType,
            },
          ]
        : undefined;

      for (const recipient of recipients) {
        try {
          const { messageId } = await provider.send({
            to: recipient,
            subject,
            html,
            attachments,
          });

          const attempt = await crud.insertSendAttempt(supabase, {
            casino_id: casinoId,
            recipient_email: recipient,
            template: 'shift_report',
            status: 'sent',
            provider_message_id: messageId,
            payload_ref: { shift_id: shiftId, report_date: reportDate },
          });

          attemptIds.push(attempt.id);
        } catch (err) {
          const errorSummary = String(safeErrorDetails(err));

          try {
            const attempt = await crud.insertSendAttempt(supabase, {
              casino_id: casinoId,
              recipient_email: recipient,
              template: 'shift_report',
              status: 'failed',
              error_summary: errorSummary,
              payload_ref: { shift_id: shiftId, report_date: reportDate },
            });
            attemptIds.push(attempt.id);
          } catch (logErr) {
            // If even logging fails, surface it but don't crash the loop
            throw new DomainError(
              'INTERNAL_ERROR',
              'Failed to log email send attempt',
              {
                details: safeErrorDetails(logErr),
              },
            );
          }

          failures.push({ recipient, error: errorSummary });
        }
      }

      return {
        success: failures.length === 0,
        attemptIds,
        failures,
      };
    },

    getSendAttempts: () => crud.getSendAttemptsByCasino(supabase),
    getFailedAttempts: () => crud.getFailedAttempts(supabase),
    getSendAttemptById: (id) => crud.getSendAttemptById(supabase, id),
  };
}

export type {
  EmailSendAttemptDto,
  EmailSendResult,
  ShiftReportEmailInput,
} from './dtos';
