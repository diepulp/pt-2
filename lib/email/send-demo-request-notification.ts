import { sendEmail } from './send-email';

const INTERNAL_RECIPIENT = 'vladimir.ivanov.dev@gmail.com';

export async function sendDemoRequestNotification({
  name,
  email,
  phone,
  company,
  message,
}: {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message?: string;
}): Promise<void> {
  const rows = [
    `<tr><td style="padding:8px 0;color:#95A2B3;font-size:13px;">Name</td><td style="padding:8px 0;color:#F7F8F8;font-size:13px;">${name}</td></tr>`,
    `<tr><td style="padding:8px 0;color:#95A2B3;font-size:13px;">Email</td><td style="padding:8px 0;color:#F7F8F8;font-size:13px;">${email}</td></tr>`,
    phone
      ? `<tr><td style="padding:8px 0;color:#95A2B3;font-size:13px;">Phone</td><td style="padding:8px 0;color:#F7F8F8;font-size:13px;">${phone}</td></tr>`
      : '',
    company
      ? `<tr><td style="padding:8px 0;color:#95A2B3;font-size:13px;">Property</td><td style="padding:8px 0;color:#F7F8F8;font-size:13px;">${company}</td></tr>`
      : '',
    message
      ? `<tr><td style="padding:8px 16px 0 0;color:#95A2B3;font-size:13px;vertical-align:top;">Message</td><td style="padding:8px 0;color:#F7F8F8;font-size:13px;">${message}</td></tr>`
      : '',
  ].join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#000212;margin:0;padding:40px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table style="max-width:520px;margin:0 auto;">
    <tr><td>
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.12em;color:#0ea5e9;text-transform:uppercase;">D3LT</p>
      <h1 style="margin:0 0 24px;font-size:20px;font-weight:700;color:#F7F8F8;">New demo request</h1>
      <table style="width:100%;border-top:1px solid rgba(255,255,255,0.06);">
        ${rows}
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail({
    to: INTERNAL_RECIPIENT,
    subject: 'New D3LT demo request',
    html,
  });
}
