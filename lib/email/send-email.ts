import { createEmailProvider } from './index';

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const provider = createEmailProvider();
  await provider.send({ to, subject, html });
}
