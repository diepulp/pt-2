import nodemailer from 'nodemailer';

import { safeErrorDetails } from '@/lib/errors/safe-error-details';

import type { EmailProvider } from './types';

const RESEND_SMTP_HOST = 'smtp.resend.com';
const RESEND_SMTP_PORT = 465;

export function createSmtpProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  const senderDomain = process.env.RESEND_SENDER_DOMAIN;
  if (!senderDomain) {
    throw new Error('RESEND_SENDER_DOMAIN environment variable is not set');
  }

  const transporter = nodemailer.createTransport({
    host: RESEND_SMTP_HOST,
    port: RESEND_SMTP_PORT,
    secure: true,
    auth: {
      user: 'resend',
      pass: apiKey,
    },
  });

  const from = `noreply@${senderDomain}`;

  return {
    async send({ to, subject, html }) {
      try {
        const info = await transporter.sendMail({ from, to, subject, html });
        return { messageId: info.messageId ?? 'unknown' };
      } catch (err) {
        throw new Error(
          `Email send failed: ${JSON.stringify(safeErrorDetails(err))}`,
        );
      }
    },
  };
}
