'use client';

import { useRouter } from 'next/navigation';
import { useActionState } from 'react';

import { signInAdminAction } from '@/app/actions/auth/sign-in-admin';

type FormState = { status: 'idle' } | { status: 'error'; message: string };

async function submitLogin(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const result = await signInAdminAction(email, password);
  if (!result.ok) {
    return { status: 'error', message: result.error ?? 'Sign-in failed.' };
  }
  return { status: 'idle' };
}

const inputStyles =
  'h-11 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-[#F7F8F8] placeholder:text-[#95A2B3]/40 transition-all duration-300 focus:border-[hsl(189_94%_43%/0.3)] focus:outline-none focus:ring-2 focus:ring-[hsl(189_94%_43%/0.2)] font-mono';

const buttonStyles =
  'mt-1 h-12 w-full rounded-full bg-[hsl(189_94%_43%)] text-sm font-semibold tracking-wide text-white transition-all duration-300 hover:bg-[hsl(189_94%_43%/0.85)] disabled:opacity-50 disabled:cursor-not-allowed';

export default function AdminLoginPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (prev, data) => {
      const result = await submitLogin(prev, data);
      if (result.status === 'idle') {
        router.push('/pilot-review');
      }
      return result;
    },
    { status: 'idle' },
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#000212] flex items-center justify-center px-5">
      <div className="w-full max-w-[420px]">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
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
              Admin
            </h1>
            <p className="mt-2 text-[15px] text-[#95A2B3]">
              Pilot review access
            </p>
          </div>

          <form action={formAction}>
            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <label
                  className="text-sm font-medium text-[#95A2B3]"
                  htmlFor="admin-email"
                >
                  Email
                </label>
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={inputStyles}
                />
              </div>

              <div className="grid gap-2">
                <label
                  className="text-sm font-medium text-[#95A2B3]"
                  htmlFor="admin-password"
                >
                  Password
                </label>
                <input
                  id="admin-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
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
                {isPending ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
