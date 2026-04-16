/** Email attachment (optional, backward-compatible) */
export interface EmailAttachment {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
}

/** Provider-agnostic email sending interface */
export interface EmailProvider {
  send(input: {
    to: string;
    subject: string;
    html: string;
    /** Optional file attachments (backward-compatible extension for EXEC-065 WS4) */
    attachments?: EmailAttachment[];
  }): Promise<{ messageId: string }>;
}

/** Result of an email send attempt */
export interface EmailSendOutcome {
  success: boolean;
  messageId?: string;
  error?: string;
}
