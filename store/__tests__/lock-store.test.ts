/**
 * Lock Store Tests
 *
 * @see LOCK-SCREEN-OPERATIONAL-PRIVACY-CONTRACT.md
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS7
 */

import { act } from '@testing-library/react';

import { useLockStore } from '../lock-store';

describe('useLockStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    // Reset store to initial state
    useLockStore.setState({
      isLocked: false,
      lockReason: null,
      lockedAt: null,
      hasHydrated: false,
    });
  });

  it('initial state is unlocked', () => {
    const state = useLockStore.getState();
    expect(state.isLocked).toBe(false);
    expect(state.lockReason).toBeNull();
    expect(state.lockedAt).toBeNull();
  });

  it('lock("manual") sets isLocked: true, lockReason: "manual", lockedAt', () => {
    const before = Date.now();
    useLockStore.getState().lock('manual');
    const state = useLockStore.getState();

    expect(state.isLocked).toBe(true);
    expect(state.lockReason).toBe('manual');
    expect(state.lockedAt).toBeGreaterThanOrEqual(before);
  });

  it('lock("idle") sets isLocked: true, lockReason: "idle", lockedAt', () => {
    useLockStore.getState().lock('idle');
    const state = useLockStore.getState();

    expect(state.isLocked).toBe(true);
    expect(state.lockReason).toBe('idle');
    expect(state.lockedAt).not.toBeNull();
  });

  it('unlock() resets to unlocked state', () => {
    useLockStore.getState().lock('manual');
    useLockStore.getState().unlock();
    const state = useLockStore.getState();

    expect(state.isLocked).toBe(false);
    expect(state.lockReason).toBeNull();
    expect(state.lockedAt).toBeNull();
  });

  it('persists lock state to sessionStorage', () => {
    useLockStore.getState().lock('manual');

    const stored = sessionStorage.getItem('pt2_lock_v1');
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.state.isLocked).toBe(true);
    expect(parsed.state.lockReason).toBe('manual');
    expect(parsed.state.lockedAt).toEqual(expect.any(Number));
  });

  it('does not persist hasHydrated or actions to sessionStorage', () => {
    useLockStore.getState().lock('manual');

    const stored = sessionStorage.getItem('pt2_lock_v1');
    const parsed = JSON.parse(stored!);

    expect(parsed.state).not.toHaveProperty('hasHydrated');
    expect(parsed.state).not.toHaveProperty('lock');
    expect(parsed.state).not.toHaveProperty('unlock');
    expect(parsed.state).not.toHaveProperty('setHasHydrated');
  });

  it('rehydrates lock state from sessionStorage', async () => {
    // Seed sessionStorage as if a prior tab session had locked
    const seed = {
      state: { isLocked: true, lockReason: 'idle', lockedAt: 1000 },
      version: 0,
    };
    sessionStorage.setItem('pt2_lock_v1', JSON.stringify(seed));

    // Trigger rehydration
    await act(async () => {
      await useLockStore.persist.rehydrate();
    });

    const state = useLockStore.getState();
    expect(state.isLocked).toBe(true);
    expect(state.lockReason).toBe('idle');
    expect(state.lockedAt).toBe(1000);
    expect(state.hasHydrated).toBe(true);
  });

  it('hasHydrated is set to true after rehydration', async () => {
    expect(useLockStore.getState().hasHydrated).toBe(false);

    await act(async () => {
      await useLockStore.persist.rehydrate();
    });

    expect(useLockStore.getState().hasHydrated).toBe(true);
  });

  it('store is pure state: no side-effect imports', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../lock-store.ts'),
      'utf-8',
    );
    // Must not import telemetry or auth hooks
    expect(source).not.toContain('emitTelemetry');
    expect(source).not.toContain('useAuth');
    expect(source).not.toContain('emit-telemetry');
  });
});
