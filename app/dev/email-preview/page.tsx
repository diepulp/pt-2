/**
 * Dev-only email template preview.
 * Access at: http://localhost:3000/dev/email-preview
 * Optional: ?template=magic_link&name=YourName
 *
 * Not deployed in production (lives under /dev/).
 */
import { readFileSync } from 'fs';
import path from 'path';

import { buildDemoRequestConfirmationHtml } from '@/lib/email/templates/demo-request-confirmation-html';

type Template = 'confirmation' | 'magic_link';

function getMagicLinkHtml(): string {
  const templatePath = path.join(
    process.cwd(),
    'supabase/templates/magic_link.html',
  );
  return readFileSync(templatePath, 'utf-8').replace(
    /\{\{\s*\.ConfirmationURL\s*\}\}/g,
    'https://example.supabase.co/auth/v1/verify?token=PREVIEW_TOKEN&type=magiclink&redirect_to=http://localhost:3000/auth/confirm',
  );
}

const TEMPLATE_META: Record<Template, { label: string; subject: string }> = {
  confirmation: {
    label: 'Demo Request Confirmation',
    subject: 'We received your d3lt demo request',
  },
  magic_link: {
    label: 'Magic Link — Sign In',
    subject: 'Sign in to d3lt',
  },
};

export default async function EmailPreviewPage(props: {
  searchParams: Promise<{ template?: string; name?: string }>;
}) {
  const { template: templateParam = 'confirmation', name = 'Jane Smith' } =
    await props.searchParams;

  const template: Template =
    templateParam === 'magic_link' ? 'magic_link' : 'confirmation';

  const html =
    template === 'magic_link'
      ? getMagicLinkHtml()
      : buildDemoRequestConfirmationHtml({ name });

  const meta = TEMPLATE_META[template];

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      {/* Header bar */}
      <div className="mx-auto mb-6 max-w-3xl">
        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
          <div>
            <p
              className="text-xs font-bold uppercase tracking-widest text-zinc-400"
              style={{ fontFamily: 'monospace' }}
            >
              Email Preview
            </p>
            <p className="mt-0.5 text-sm text-zinc-500">
              {meta.label}
              {template === 'confirmation' && (
                <>
                  &nbsp;&mdash; previewing as&nbsp;
                  <span className="font-medium text-zinc-300">{name}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              DEV ONLY
            </span>
          </div>
        </div>

        {/* Template switcher */}
        <div className="mt-2 flex items-center gap-3">
          <a
            href="?template=confirmation"
            className={`text-[10px] font-semibold uppercase tracking-widest transition-colors ${
              template === 'confirmation'
                ? 'text-cyan-500'
                : 'text-zinc-600 hover:text-zinc-400'
            }`}
            style={{ fontFamily: 'monospace' }}
          >
            Confirmation
          </a>
          <span className="text-zinc-700">·</span>
          <a
            href="?template=magic_link"
            className={`text-[10px] font-semibold uppercase tracking-widest transition-colors ${
              template === 'magic_link'
                ? 'text-cyan-500'
                : 'text-zinc-600 hover:text-zinc-400'
            }`}
            style={{ fontFamily: 'monospace' }}
          >
            Magic Link
          </a>
          {template === 'confirmation' && (
            <>
              <span className="text-zinc-700">·</span>
              <p
                className="text-[10px] text-zinc-600"
                style={{ fontFamily: 'monospace' }}
              >
                Add ?name=YourName to preview with a different recipient.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Email frame */}
      <div className="mx-auto max-w-3xl">
        <div
          className="overflow-hidden rounded-xl border border-zinc-800 shadow-2xl"
          style={{ background: '#000212' }}
        >
          {/* Simulated email client chrome */}
          <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-2 w-2 rounded-full bg-zinc-600" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-500">
                  <span className="text-zinc-400">Subject:</span>&nbsp;
                  {meta.subject}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  <span className="text-zinc-400">To:</span>&nbsp;
                  {template === 'confirmation'
                    ? `${name.toLowerCase().replace(/\s+/g, '.')}@casino.com`
                    : 'user@casino.com'}
                </p>
              </div>
            </div>
          </div>

          {/* Email render */}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>

        {/* Raw HTML toggle */}
        <details className="mt-4">
          <summary
            className="cursor-pointer text-xs font-bold uppercase tracking-widest text-zinc-600 hover:text-zinc-400"
            style={{ fontFamily: 'monospace' }}
          >
            View raw HTML
          </summary>
          <pre className="mt-3 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-[11px] text-zinc-400">
            {html}
          </pre>
        </details>
      </div>
    </div>
  );
}
