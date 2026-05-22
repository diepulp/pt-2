import { sendEmail } from './send-email';
import { buildWalkthroughRequestConfirmationHtml } from './templates/walkthrough-request-confirmation-html';

export async function sendWalkthroughRequestConfirmation({
  name,
  email,
}: {
  name: string;
  email: string;
}): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Your d3lt walkthrough request',
    html: buildWalkthroughRequestConfirmationHtml({ name }),
  });
}
