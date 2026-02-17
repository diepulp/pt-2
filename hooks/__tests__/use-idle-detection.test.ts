/**
 * Idle Detection Hook Tests
 *
 * @see EXECUTION-SPEC-GAP-SIGN-OUT.md §WS7
 */

import { renderHook, act } from '@testing-library/react';

import { useIdleDetection } from '../use-idle-detection';

describe('useIdleDetection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires onIdle after timeout', () => {
    const onIdle = jest.fn();

    renderHook(() =>
      useIdleDetection({ timeout: 1000, onIdle, enabled: true }),
    );

    expect(onIdle).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('activity events reset the timer', () => {
    const onIdle = jest.fn();

    renderHook(() =>
      useIdleDetection({
        timeout: 1000,
        onIdle,
        enabled: true,
        throttleMs: 0,
      }),
    );

    // Advance 800ms, then trigger activity
    act(() => {
      jest.advanceTimersByTime(800);
    });

    act(() => {
      document.dispatchEvent(new Event('mousemove'));
    });

    // Advance another 800ms — should NOT fire (timer was reset)
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(onIdle).not.toHaveBeenCalled();

    // Advance the remaining 200ms — should fire
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('keydown and pointerdown also reset the timer', () => {
    const onIdle = jest.fn();

    renderHook(() =>
      useIdleDetection({
        timeout: 1000,
        onIdle,
        enabled: true,
        throttleMs: 0,
      }),
    );

    act(() => {
      jest.advanceTimersByTime(800);
      document.dispatchEvent(new Event('keydown'));
    });

    act(() => {
      jest.advanceTimersByTime(800);
      document.dispatchEvent(new Event('pointerdown'));
    });

    act(() => {
      jest.advanceTimersByTime(999);
    });

    expect(onIdle).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('enabled: false prevents timer from running', () => {
    const onIdle = jest.fn();

    renderHook(() =>
      useIdleDetection({ timeout: 1000, onIdle, enabled: false }),
    );

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(onIdle).not.toHaveBeenCalled();
  });

  it('cleanup removes listeners on unmount', () => {
    const onIdle = jest.fn();
    const removeSpy = jest.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() =>
      useIdleDetection({ timeout: 1000, onIdle, enabled: true }),
    );

    unmount();

    const removedEvents = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedEvents).toContain('mousemove');
    expect(removedEvents).toContain('keydown');
    expect(removedEvents).toContain('pointerdown');

    removeSpy.mockRestore();
  });

  it('throttled activity handler skips resets within throttleMs', () => {
    const onIdle = jest.fn();

    renderHook(() =>
      useIdleDetection({
        timeout: 1000,
        onIdle,
        enabled: true,
        throttleMs: 500,
      }),
    );

    // Advance 600ms
    act(() => {
      jest.advanceTimersByTime(600);
    });

    // First activity event at 600ms — accepted (last was 0)
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    act(() => {
      document.dispatchEvent(new Event('mousemove'));
    });

    // Rapid second activity at 600ms + 100ms — should be throttled
    jest.spyOn(Date, 'now').mockReturnValue(now + 100);

    act(() => {
      document.dispatchEvent(new Event('mousemove'));
    });

    jest.spyOn(Date, 'now').mockRestore();

    // The timer was only reset once (at 600ms), not twice
    // So idle should fire 1000ms after the first accepted event
    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(onIdle).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
