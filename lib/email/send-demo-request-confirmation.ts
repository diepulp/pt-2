import { sendEmail } from './send-email';
import { buildDemoRequestConfirmationHtml } from './templates/demo-request-confirmation-html';

export async function sendDemoRequestConfirmation({
  name,
  email,
}: {
  name: string;
  email: string;
}): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'We received your d3lt demo request',
    html: buildDemoRequestConfirmationHtml({ name }),
  });
}
