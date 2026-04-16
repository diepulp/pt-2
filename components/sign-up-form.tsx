'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { getErrorMessage } from '@/lib/errors/error-utils';
import { createBrowserComponentClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const inputStyles =
  'h-11 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-[#F7F8F8] placeholder:text-[#95A2B3]/40 transition-all duration-300 focus:border-[hsl(189_94%_43%/0.3)] focus:outline-none focus:ring-2 focus:ring-[hsl(189_94%_43%/0.2)]';

const buttonStyles =
  'mt-1 h-12 w-full rounded-full bg-[hsl(189_94%_43%)] text-sm font-semibold tracking-wide text-white shadow-[0_1px_40px_hsl(189_94%_43%/0.25)] transition-all duration-300 hover:bg-[hsl(189_94%_43%/0.85)] hover:shadow-[0_1px_50px_hsl(189_94%_43%/0.35)] disabled:opacity-50 disabled:cursor-not-allowed';

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createBrowserComponentClient();
    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/protected`,
        },
      });
      if (error) throw error;
      router.push('/auth/sign-up-success');
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('flex flex-col', className)} {...props}>
      {/* Glassmorphic card */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 sm:p-8">
        {/* Header */}
        <div className="mb-6">
          <h1
            className="text-2xl font-bold"
            style={{
              background:
                'linear-gradient(to right bottom, rgb(247 248 248) 30%, rgba(247 248 248 / 0.38))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Create account
          </h1>
          <p className="mt-2 text-[15px] text-[#95A2B3]">
            Set up your pit station access
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSignUp}>
          <div className="flex flex-col gap-5">
            <div className="grid gap-2">
              <label
                htmlFor="signup-email"
                className="text-sm font-medium text-[#95A2B3]"
              >
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                placeholder="pit.boss@casino.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputStyles}
              />
            </div>

            <div className="grid gap-2">
              <label
                htmlFor="signup-password"
                className="text-sm font-medium text-[#95A2B3]"
              >
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputStyles}
              />
            </div>

            <div className="grid gap-2">
              <label
                htmlFor="signup-repeat-password"
                className="text-sm font-medium text-[#95A2B3]"
              >
                Confirm password
              </label>
              <input
                id="signup-repeat-password"
                type="password"
                autoComplete="new-password"
                required
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
                className={inputStyles}
              />
            </div>

            {error && <p className="text-sm text-red-400/90">{error}</p>}

            <button type="submit" disabled={isLoading} className={buttonStyles}>
              {isLoading ? 'Creating account\u2026' : 'Create account'}
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-[#95A2B3]/60">
            Already have an account?{' '}
            <Link
              href="/auth/login"
              className="text-[#95A2B3] transition-colors duration-300 hover:text-[#F7F8F8]"
            >
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
