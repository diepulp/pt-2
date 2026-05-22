export function buildDemoRequestConfirmationHtml({
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
  <title>Your d3lt demo access</title>
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
                          <p style="margin:0;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#06b6d4;font-family:'Michroma',monospace,'Courier New',Courier;">Demo access</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-left:14px;">
                          <h1 style="margin:6px 0 0;font-size:24px;font-weight:700;color:#f7f8f8;letter-spacing:-0.02em;line-height:1.25;">We received<br>your request.</h1>
                        </td>
                      </tr>
                    </table>

                    <!-- Greeting -->
                    <p style="margin:0 0 14px;font-size:15px;color:#f7f8f8;line-height:1.6;">Hi ${safeHtml(name)},</p>

                    <!-- Body -->
                    <p style="margin:0 0 12px;font-size:14px;color:#8b9ab0;line-height:1.75;">
                      Thanks for your interest in d3lt. We&rsquo;ve received your demo request and have started preparing access to the application.
                    </p>
                    <p style="margin:0;font-size:14px;color:#8b9ab0;line-height:1.75;">
                      You should receive a secure magic link shortly. Follow that link to sign in and explore the demo environment. The link is issued specifically for your request, so no password is required.
                    </p>

                    <!-- Divider -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
                      <tr>
                        <td height="1" style="background-color:#16182a;font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>

                    <!-- What happens next label -->
                    <p style="margin:0 0 20px;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#06b6d4;font-family:'Michroma',monospace,'Courier New',Courier;">What happens next</p>

                    <!-- Step 1 -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
                      <tr>
                        <td width="36" style="vertical-align:top;padding-top:1px;">
                          <span style="font-family:'Michroma',monospace,'Courier New',Courier;font-size:22px;font-weight:400;color:#163a4a;line-height:1;display:block;">01</span>
                        </td>
                        <td style="vertical-align:top;padding-left:4px;">
                          <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#f7f8f8;line-height:1.4;">Your request is reviewed</p>
                          <p style="margin:0;font-size:13px;color:#8b9ab0;line-height:1.65;">We confirm your demo access request and prepare the appropriate demo environment.</p>
                        </td>
                      </tr>
                    </table>

                    <!-- Step 2 -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
                      <tr>
                        <td width="36" style="vertical-align:top;padding-top:1px;">
                          <span style="font-family:'Michroma',monospace,'Courier New',Courier;font-size:22px;font-weight:400;color:#163a4a;line-height:1;display:block;">02</span>
                        </td>
                        <td style="vertical-align:top;padding-left:4px;">
                          <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#f7f8f8;line-height:1.4;">You receive your magic link</p>
                          <p style="margin:0;font-size:13px;color:#8b9ab0;line-height:1.65;">A secure sign-in link will arrive by email shortly. Follow it to access the application.</p>
                        </td>
                      </tr>
                    </table>

                    <!-- Step 3 -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td width="36" style="vertical-align:top;padding-top:1px;">
                          <span style="font-family:'Michroma',monospace,'Courier New',Courier;font-size:22px;font-weight:400;color:#163a4a;line-height:1;display:block;">03</span>
                        </td>
                        <td style="vertical-align:top;padding-left:4px;">
                          <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#f7f8f8;line-height:1.4;">You explore the demo</p>
                          <p style="margin:0;font-size:13px;color:#8b9ab0;line-height:1.65;">You can review the application flow and core operational surfaces at your own pace. If you&rsquo;d like a guided walkthrough afterward, we&rsquo;ll coordinate a session tailored to your property&rsquo;s scale and workflow.</p>
                        </td>
                      </tr>
                    </table>

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
                You&rsquo;re receiving this because you requested demo access at d3lt.app.<br>
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
