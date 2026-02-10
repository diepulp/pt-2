'use client';

/**
 * Lock Screen Overlay
 *
 * Full viewport overlay with PIN re-authentication.
 * Handles both "setup" mode (no PIN set) and "verify" mode.
 * Non-dismissible — no ESC, no click-outside.
 *
 * Telemetry: lock/unlock events emitted here (component layer),
 * NOT from the Zustand store (pure state).
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS6
 */

import { Lock, LogOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { getPinStatusAction } from '@/app/actions/auth/get-pin-status';
import { setPinAction } from '@/app/actions/auth/set-pin';
import { verifyPinAction } from '@/app/actions/auth/verify-pin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSignOut } from '@/hooks/auth/use-sign-out';
import { useLockScreen } from '@/hooks/ui/use-lock-screen';
import { Z } from '@/lib/constants/z-index';

type LockMode = 'loading' | 'verify' | 'setup';

export function LockScreen() {
  const { unlock } = useLockScreen();
  const { signOut, isPending: isSigningOut } = useSignOut();

  const [mode, setMode] = useState<LockMode>('loading');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine setup vs verify mode on mount
  useEffect(() => {
    startTransition(async () => {
      const result = await getPinStatusAction();
      if (result.ok && result.data) {
        setMode(result.data.hasPin ? 'verify' : 'setup');
      } else {
        setMode('setup');
      }
    });
  }, []);

  // Auto-focus PIN input when mode is determined
  useEffect(() => {
    if (mode !== 'loading') {
      inputRef.current?.focus();
    }
  }, [mode]);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  const handleVerify = useCallback(() => {
    startTransition(async () => {
      setError('');
      const result = await verifyPinAction(pin);

      if (!result.ok && result.code === 'RATE_LIMIT_EXCEEDED') {
        // Auto-trigger sign-out on rate limit
        signOut();
        return;
      }

      if (result.ok && result.data?.verified) {
        unlock();
        return;
      }

      // Mismatch
      triggerShake();
      setError('Incorrect PIN');
      setPin('');
      inputRef.current?.focus();
    });
  }, [pin, signOut, unlock, triggerShake]);

  const handleSetup = useCallback(() => {
    startTransition(async () => {
      setError('');

      if (pin !== confirmPin) {
        setError('PINs do not match');
        setConfirmPin('');
        return;
      }

      const result = await setPinAction(pin);

      if (!result.ok) {
        setError(result.error ?? 'Failed to set PIN');
        setPin('');
        setConfirmPin('');
        inputRef.current?.focus();
        return;
      }

      // PIN set successfully — unlock
      unlock();
    });
  }, [pin, confirmPin, unlock]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (mode === 'verify') {
        handleVerify();
      } else if (mode === 'setup') {
        handleSetup();
      }
    },
    [mode, handleVerify, handleSetup],
  );

  // Block ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md"
      style={{ zIndex: Z.LOCK_SCREEN }}
      role="dialog"
      aria-modal="true"
      aria-label="Lock screen"
    >
      <div
        className={`w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-2xl ${
          shake ? 'animate-shake' : ''
        }`}
      >
        <div className="flex flex-col items-center gap-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Lock className="h-7 w-7 text-muted-foreground" />
          </div>

          <div className="text-center">
            <h2 className="text-lg font-semibold">
              {mode === 'setup' ? 'Create Your PIN' : 'Screen Locked'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === 'setup'
                ? 'Set a 4-6 digit PIN for quick unlock'
                : 'Enter your PIN to unlock'}
            </p>
          </div>

          {mode === 'loading' ? (
            <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
          ) : (
            <form onSubmit={handleSubmit} className="w-full space-y-3">
              <Input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder={
                  mode === 'setup' ? 'New PIN (4-6 digits)' : 'Enter PIN'
                }
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                disabled={isPending}
                autoComplete="off"
              />

              {mode === 'setup' && (
                <Input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Confirm PIN"
                  value={confirmPin}
                  onChange={(e) =>
                    setConfirmPin(e.target.value.replace(/\D/g, ''))
                  }
                  disabled={isPending}
                  autoComplete="off"
                />
              )}

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={
                  isPending ||
                  pin.length < 4 ||
                  (mode === 'setup' && confirmPin.length < 4)
                }
              >
                {isPending
                  ? 'Verifying...'
                  : mode === 'setup'
                    ? 'Set PIN & Unlock'
                    : 'Unlock'}
              </Button>
            </form>
          )}

          <button
            type="button"
            onClick={signOut}
            disabled={isSigningOut}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            {isSigningOut ? 'Signing out...' : 'Not you? Sign out'}
          </button>
        </div>
      </div>
    </div>
  );
}
