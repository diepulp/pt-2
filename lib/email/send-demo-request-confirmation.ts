import { sendEmail } from './send-email';

export async function sendDemoRequestConfirmation({
  name,
  email,
}: {
  name: string;
  email: string;
}): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#000212;margin:0;padding:40px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table style="max-width:520px;margin:0 auto;">
    <tr><td>
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.12em;color:#0ea5e9;text-transform:uppercase;">D3LT</p>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#F7F8F8;">We received your request.</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#95A2B3;line-height:1.6;">Hi ${name},</p>
      <p style="margin:0 0 16px;font-size:14px;color:#95A2B3;line-height:1.6;">
        We've received your walkthrough request and will be in touch within one business day
        to schedule a session tailored to your floor.
      </p>
      <p style="margin:0;font-size:14px;color:#95A2B3;line-height:1.6;">— The D3LT team</p>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail({
    to: email,
    subject: 'We received your D3LT demo request',
    html,
  });
}
