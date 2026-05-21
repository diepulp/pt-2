const CALENDAR_LINK = 'https://calendar.app.google/8ofiPtRVFdSkgjPy9';

export function buildWalkthroughRequestConfirmationHtml({
  name,
}: {
  name: string;
}): string {
  const safeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your d3lt walkthrough request</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Michroma&display=swap');
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{border:0;line-height:100%;outline:none;text-decoration:none;}
    body{height:100%!important;margin:0!important;padding:0!important;width:100%!important;}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#000212;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#000212;">
    <tr>
      <td align="center" style="padding:48px 16px 40px;">

        <!-- Inner container: max 560px -->
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <!-- ── Logo row ── -->
          <tr>
            <td style="padding-bottom:20px;">
              <span style="font-family:'Michroma',monospace,'Courier New',Courier;font-size:17px;font-weight:400;letter-spacing:0.04em;color:#06b6d4;line-height:1;">d3lt</span>
            </td>
          </tr>

          <!-- Teal rule under logo -->
          <tr>
            <td style="padding-bottom:28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="48" height="1" style="background-color:#06b6d4;font-size:0;line-height:0;">&nbsp;</td>
                  <td height="1" style="background-color:#16182a;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Main card ── -->
          <tr>
            <td style="background-color:#0c0d18;border-radius:12px;border:1px solid #16182a;padding:0;overflow:hidden;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">

                <!-- Card top accent bar -->
                <tr>
                  <td height="3" style="background-color:#06b6d4;font-size:0;line-height:0;">&nbsp;</td>
                </tr>

                <!-- Card content -->
                <tr>
                  <td style="padding:36px 40px 40px;">

                    <!-- Heading with left accent -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                      <tr>
                        <td width="3" style="background-color:#06b6d4;border-radius:2px;" rowspan="2">&nbsp;</td>
                        <td style="padding-left:14px;padding-bottom:2px;">
                          <p style="margin:0;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#06b6d4;font-family:'Michroma',monospace,'Courier New',Courier;">Operational walkthrough</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-left:14px;">
                          <h1 style="margin:6px 0 0;font-size:24px;font-weight:700;color:#f7f8f8;letter-spacing:-0.02em;line-height:1.25;">Request received.</h1>
                        </td>
                      </tr>
                    </table>

                    <!-- Greeting -->
                    <p style="margin:0 0 14px;font-size:15px;color:#f7f8f8;line-height:1.6;">Hi ${safeHtml(name)},</p>

                    <!-- Body -->
                    <p style="margin:0;font-size:14px;color:#8b9ab0;line-height:1.75;">
                      Your walkthrough request has been received. Use the scheduling link below to choose a time. Once scheduled, you&rsquo;ll receive a calendar invite and any access instructions needed before the session.
                    </p>

                    <!-- Divider -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
                      <tr>
                        <td height="1" style="background-color:#16182a;font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>

                    <!-- Calendar CTA -->
                    <p style="margin:0 0 20px;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#06b6d4;font-family:'Michroma',monospace,'Courier New',Courier;">Schedule your session</p>

                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="border-radius:8px;background-color:#06b6d4;">
                          <a href="${CALENDAR_LINK}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:13px;font-weight:600;color:#000212;text-decoration:none;letter-spacing:0.02em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">Choose a time &rarr;</a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:16px 0 0;font-size:12px;color:#4a5568;line-height:1.6;">
                      Or copy this link: <a href="${CALENDAR_LINK}" style="color:#06b6d4;text-decoration:none;">${CALENDAR_LINK}</a>
                    </p>

                    <!-- Divider -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 24px;">
                      <tr>
                        <td height="1" style="background-color:#16182a;font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>

                    <!-- Sign-off -->
                    <p style="margin:0;font-size:14px;color:#8b9ab0;line-height:1.6;">&mdash;&thinsp;The d3lt team</p>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#2e3248;line-height:1.6;">
                You&rsquo;re receiving this because you requested an operational walkthrough at d3lt.app.<br>
                This is a transactional email &mdash; no action required.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}
