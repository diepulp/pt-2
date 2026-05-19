'use client';

/**
 * RequestAccessForm — Public pilot access request surface.
 *
 * Surface Classification (ADR-041 §5.2):
 *   Rendering Delivery: Client Shell — multi-field form with optimistic feedback;
 *                        no server read required at load time.
 *   Data Aggregation:   Simple Query — submit-only; no aggregated data consumed.
 *   Rejected: RSC Prefetch — pure form submission, nothing to prefetch.
 *   Rejected: BFF RPC — single INSERT action, no aggregation.
 *   Metric Provenance:  None — no truth-bearing metrics rendered.
 */

import { useActionState } from 'react';

import { requestPilotAccessAction } from '@/app/actions/auth/request-pilot-access';

type FormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string };

async function submitRequest(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await requestPilotAccessAction(formData);

  if (!result.ok) {
    if (result.code === 'VALIDATION_ERROR') {
      return {
        status: 'error',
        message: 'Please check your submission and try again.',
      };
    }
    return {
      status: 'error',
      message: 'Unable to submit your request. Please try again.',
    };
  }

  return { status: 'success' };
}

const inputStyles =
  'h-11 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-[#F7F8F8] placeholder:text-[#95A2B3]/40 transition-all duration-300 focus:border-[hsl(189_94%_43%/0.3)] focus:outline-none focus:ring-2 focus:ring-[hsl(189_94%_43%/0.2)] font-mono';

const labelStyles = 'text-sm font-medium text-[#95A2B3]';

const buttonStyles =
  'mt-1 h-12 w-full rounded-full bg-[hsl(189_94%_43%)] text-sm font-semibold tracking-wide text-white shadow-[0_1px_40px_hsl(189_94%_43%/0.25)] transition-all duration-300 hover:bg-[hsl(189_94%_43%/0.85)] hover:shadow-[0_1px_50px_hsl(189_94%_43%/0.35)] disabled:opacity-50 disabled:cursor-not-allowed';

export function RequestAccessForm({ className }: { className?: string }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    submitRequest,
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
            Request Access
          </h1>
          <p className="mt-2 text-[15px] text-[#95A2B3]">
            d3lt is currently in closed pilot. Tell us about your operation and
            we&apos;ll be in touch.
          </p>
        </div>

        {state.status === 'success' ? (
          <div className="rounded-lg border border-[hsl(189_94%_43%/0.3)] bg-[hsl(189_94%_43%/0.08)] px-4 py-5 text-sm text-[#F7F8F8]">
            Thanks for your interest! We&apos;ll be in touch when a pilot spot
            opens.
          </div>
        ) : (
          <form action={formAction}>
            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <label htmlFor="ra-name" className={labelStyles}>
                  Your name
                </label>
                <input
                  id="ra-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Smith"
                  required
                  className={inputStyles}
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="ra-email" className={labelStyles}>
                  Work email
                </label>
                <input
                  id="ra-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="jane@casino.com"
                  required
                  className={inputStyles}
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="ra-casino" className={labelStyles}>
                  Casino / property name
                </label>
                <input
                  id="ra-casino"
                  name="casino_name"
                  type="text"
                  placeholder="Grand Casino"
                  required
                  className={inputStyles}
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="ra-role" className={labelStyles}>
                  Your role
                </label>
                <input
                  id="ra-role"
                  name="role"
                  type="text"
                  placeholder="Pit Manager"
                  required
                  className={inputStyles}
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="ra-tables" className={labelStyles}>
                  Estimated table count{' '}
                  <span className="text-xs text-[#95A2B3]/50">(optional)</span>
                </label>
                <input
                  id="ra-tables"
                  name="estimated_table_count"
                  type="number"
                  min="1"
                  placeholder="12"
                  className={`${inputStyles} tabular-nums`}
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="ra-message" className={labelStyles}>
                  Anything else you&apos;d like to share{' '}
                  <span className="text-xs text-[#95A2B3]/50">(optional)</span>
                </label>
                <textarea
                  id="ra-message"
                  name="message"
                  rows={3}
                  maxLength={1000}
                  placeholder="Tell us about your operation or specific needs…"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-[#F7F8F8] placeholder:text-[#95A2B3]/40 transition-all duration-300 focus:border-[hsl(189_94%_43%/0.3)] focus:outline-none focus:ring-2 focus:ring-[hsl(189_94%_43%/0.2)] font-mono resize-none"
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
                {isPending ? 'Submitting…' : 'Request access'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
