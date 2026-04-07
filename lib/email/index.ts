import { createResendProvider } from './resend-adapter';
import type { EmailProvider } from './types';

export function createEmailProvider(): EmailProvider {
  return createResendProvider();
}

export type { EmailProvider, EmailSendOutcome } from './types';
