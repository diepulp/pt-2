'use client';

/**
 * MagicLinkForm — Pilot-contained login surface.
 *
 * Surface Classification (ADR-041 §5.1):
 *   Rendering Delivery: Client Shell — form interaction + optimistic pending state;
 *                        no server data to prefetch before render.
 *   Data Aggregation:   Simple Query — email-only submit; no server data consumed at load.
 *   Rejected: RSC Prefetch — no server-authoritative read required before form render.
 *   Rejected: BFF RPC — no cross-context aggregation; single action call.
 *   Metric Provenance:  None — no truth-bearing metrics rendered.
 */

import Link from 'next/link';
import { useActionState } from 'react';

import { sendMagicLinkAction } from '@/app/actions/auth/send-magic-link';

type FormState =
  | { status: 'idle' }
  | { status: 'approved' }
  | { status: 'not_approved' }
  | { status: 'error'; message: string };

const inputStyles =
  'h-11 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-[#F7F8F8] placeholder:text-[#95A2B3]/40 transition-all duration-300 focus:border-[hsl(189_94%_43%/0.3)] focus:outline-none focus:ring-2 focus:ring-[hsl(189_94%_43%/0.2)]';

const buttonStyles =
  'mt-1 h-12 w-full rounded-full bg-[hsl(189_94%_43%)] text-sm font-semibold tracking-wide text-white shadow-[0_1px_40px_hsl(189_94%_43%/0.25)] transition-all duration-300 hover:bg-[hsl(189_94%_43%/0.85)] hover:shadow-[0_1px_50px_hsl(189_94%_43%/0.35)] disabled:opacity-50 disabled:cursor-not-allowed';

async function submitMagicLink(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = formData.get('email') as string;
  const result = await sendMagicLinkAction(email);

  if (!result.ok) {
    return {
      status: 'error',
      message: 'An unexpected error occurred. Please try again.',
    };
  }

  const allowlistResult = result.data?.allowlistResult;
  if (allowlistResult === 'approved') return { status: 'approved' };
  return { status: 'not_approved' };
}

export function MagicLinkForm({ className }: { className?: string }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    submitMagicLink,
    { status: 'idle' },
  );

  return (
    <div className={className}>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-8">
        <div className="mb-6">
          <h1
            className="text-2xl font-bold"
            style={{
              background:
                'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247,248,248,0.38))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Sign in
          </h1>
          <p className="mt-2 text-[15px] text-[#95A2B3]">
            Enter your email to access the pit station
          </p>
        </div>

        {state.status === 'approved' ? (
          <div className="rounded-lg border border-[hsl(189_94%_43%/0.3)] bg-[hsl(189_94%_43%/0.08)] px-4 py-5 text-sm text-[#F7F8F8]">
            Check your email for a sign-in link.
          </div>
        ) : state.status === 'not_approved' ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-5 text-sm text-[#95A2B3]">
              This is a closed pilot. Request access to be notified when a spot
              opens.
            </div>
            <Link
              href="/request-access"
              className="block w-full rounded-full border border-white/[0.12] bg-white/[0.04] py-3 text-center text-sm font-semibold tracking-wide text-[#F7F8F8] transition-all duration-300 hover:bg-white/[0.08]"
            >
              Request Access
            </Link>
          </div>
        ) : (
          <form action={formAction}>
            <div className="flex flex-col gap-5">
              <div className="grid gap-2">
                <label
                  htmlFor="magic-email"
                  className="text-sm font-medium text-[#95A2B3]"
                >
                  Email address
                </label>
                <input
                  id="magic-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="pit.boss@casino.com"
                  required
                  className={inputStyles}
                />
              </div>

              {state.status === 'error' && (
                <p className="text-sm text-red-400/90">{state.message}</p>
              )}

              <button
                type="submit"
                disabled={isPending}
                className={buttonStyles}
              >
                {isPending ? 'Checking access…' : 'Send sign-in link'}
              </button>
            </div>

            <div className="mt-6 text-center text-sm text-[#95A2B3]/60">
              Not yet a member?{' '}
              <Link
                href="/request-access"
                className="text-[#95A2B3] transition-colors duration-300 hover:text-[#F7F8F8]"
              >
                Request access
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
