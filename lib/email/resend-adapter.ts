import { Resend } from 'resend';

import { safeErrorDetails } from '@/lib/errors/safe-error-details';

import type { EmailProvider } from './types';

export function createResendProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  const senderDomain = process.env.RESEND_SENDER_DOMAIN;
  if (!senderDomain) {
    throw new Error('RESEND_SENDER_DOMAIN environment variable is not set');
  }

  const resend = new Resend(apiKey);
  const from = `noreply@${senderDomain}`;

  return {
    async send({ to, subject, html, attachments }) {
      const { data, error } = await resend.emails.send({
        from,
        to,
        subject,
        html,
        ...(attachments?.length
          ? {
              attachments: attachments.map((a) => ({
                filename: a.filename,
                content: Buffer.from(a.content),
                ...(a.contentType ? { content_type: a.contentType } : {}),
              })),
            }
          : {}),
      });

      if (error) {
        throw new Error(
          `Email send failed: ${JSON.stringify(safeErrorDetails(error))}`,
        );
      }

      return { messageId: data?.id ?? 'unknown' };
    },
  };
}
