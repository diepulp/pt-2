import type { Database } from '@/types/database.types';

type EmailSendAttemptInsert =
  Database['public']['Tables']['email_send_attempt']['Insert'];

/** DTO for reading send attempt records */
export type EmailSendAttemptDto =
  Database['public']['Tables']['email_send_attempt']['Row'];

/** Input for inserting a send attempt */
export type InsertSendAttemptInput = Pick<
  EmailSendAttemptInsert,
  | 'casino_id'
  | 'recipient_email'
  | 'template'
  | 'status'
  | 'provider_message_id'
  | 'error_summary'
  | 'payload_ref'
  | 'original_attempt_id'
>;

/** Input for the sendShiftReport method */
export interface ShiftReportEmailInput {
  casinoId: string;
  shiftId: string;
  recipients: string[];
  reportDate: string;
}

/** Result returned by sendShiftReport */
export interface EmailSendResult {
  success: boolean;
  attemptIds: string[];
  failures: Array<{ recipient: string; error: string }>;
}
