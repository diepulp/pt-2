'use client';

// Dev-only password login — replicates the pre-PRD-083 LoginForm pattern.
// Uses createBrowserComponentClient() + signInWithPassword() directly in the
// browser (same path as the original LoginForm), then routes through /start
// for the standard staff-binding gateway. pitboss@dev.local carries real RLS
// credentials from seed.sql — this is NOT the mock dev-bypass context.

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { getErrorMessage } from '@/lib/errors/error-utils';
import { createBrowserComponentClient } from '@/lib/supabase/client';

const inputStyles =
  'h-10 w-full rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 font-mono text-sm text-[#F7F8F8] placeholder:text-[#95A2B3]/40 focus:border-yellow-500/30 focus:outline-none';

export function DevLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createBrowserComponentClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.push('/start');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.03] p-4">
      <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-widest text-yellow-500/60">
        Dev — Password Login
      </p>
      <form onSubmit={handleLogin} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="pitboss@dev.local"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputStyles}
        />
        <input
          name="password"
          type="password"
          required
          placeholder="devpass123"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputStyles}
        />
        {error && <p className="text-xs text-red-400/90">{error}</p>}
        <button
          type="submit"
          disabled={isLoading}
          className="h-10 w-full rounded-full border border-yellow-500/30 bg-yellow-500/10 text-sm font-semibold text-yellow-400/80 transition-all hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Signing in…' : 'Sign in (dev)'}
        </button>
      </form>
      <div className="mt-3 space-y-1 border-t border-yellow-500/10 pt-3">
        <p className="font-mono text-[10px] text-yellow-500/40">
          Seeded accounts · password: devpass123
        </p>
        <p className="font-mono text-[10px] text-yellow-500/30">
          pitboss@dev.local — Casino 1, Marcus Thompson
        </p>
        <p className="font-mono text-[10px] text-yellow-500/30">
          pitboss2@dev.local — Casino 2, David Kim
        </p>
      </div>
    </div>
  );
}
