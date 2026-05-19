import { createSmtpProvider } from './smtp-adapter';
import type { EmailProvider } from './types';

export function createEmailProvider(): EmailProvider {
  return createSmtpProvider();
}

export type { EmailProvider, EmailSendOutcome } from './types';
export { createResendProvider } from './resend-adapter';
export { createSmtpProvider } from './smtp-adapter';
