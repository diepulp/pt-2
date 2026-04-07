/** Provider-agnostic email sending interface */
export interface EmailProvider {
  send(input: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ messageId: string }>;
}

/** Result of an email send attempt */
export interface EmailSendOutcome {
  success: boolean;
  messageId?: string;
  error?: string;
}
