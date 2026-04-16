'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { getErrorMessage } from '@/lib/errors/error-utils';
import { createBrowserComponentClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const inputStyles =
  'h-11 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-[#F7F8F8] placeholder:text-[#95A2B3]/40 transition-all duration-300 focus:border-[hsl(189_94%_43%/0.3)] focus:outline-none focus:ring-2 focus:ring-[hsl(189_94%_43%/0.2)]';

const buttonStyles =
  'mt-1 h-12 w-full rounded-full bg-[hsl(189_94%_43%)] text-sm font-semibold tracking-wide text-white shadow-[0_1px_40px_hsl(189_94%_43%/0.25)] transition-all duration-300 hover:bg-[hsl(189_94%_43%/0.85)] hover:shadow-[0_1px_50px_hsl(189_94%_43%/0.35)] disabled:opacity-50 disabled:cursor-not-allowed';

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createBrowserComponentClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.push('/protected');
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
            New password
          </h1>
          <p className="mt-2 text-[15px] text-[#95A2B3]">
            Choose a new password for your account
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleUpdatePassword}>
          <div className="flex flex-col gap-5">
            <div className="grid gap-2">
              <label
                htmlFor="new-password"
                className="text-sm font-medium text-[#95A2B3]"
              >
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Enter new password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputStyles}
              />
            </div>

            {error && <p className="text-sm text-red-400/90">{error}</p>}

            <button type="submit" disabled={isLoading} className={buttonStyles}>
              {isLoading ? 'Saving\u2026' : 'Save new password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
