/**
 * Lock Store Tests
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS7
 */

import { useLockStore } from '../lock-store';

describe('useLockStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useLockStore.setState({
      isLocked: false,
      lockReason: null,
      lockedAt: null,
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
