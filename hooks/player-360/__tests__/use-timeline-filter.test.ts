/**
 * useTimelineFilter Hook Tests
 *
 * Tests for the Zustand store managing timeline filter state.
 * Verifies state management, actions, and derived values.
 *
 * @see PRD-023 Player 360 Panels v0
 * @see WS7 Testing & QA
 */

import { act, renderHook } from '@testing-library/react';

import {
  useTimelineFilter,
  useTimelineFilterStore,
  type SourceCategory,
} from '../use-timeline-filter';

describe('useTimelineFilter', () => {
  // Reset store before each test
  beforeEach(() => {
    const { result } = renderHook(() => useTimelineFilterStore());
    act(() => {
      result.current.clearFilter();
      result.current.setTimeLens('12w');
      result.current.clearScrollTarget();
    });
  });

  describe('initial state', () => {
    it('has null activeCategory by default', () => {
      const { result } = renderHook(() => useTimelineFilter());

      expect(result.current.activeCategory).toBeNull();
    });

    it('has 12w timeLens by default', () => {
      const { result } = renderHook(() => useTimelineFilter());

      expect(result.current.timeLens).toBe('12w');
    });

    it('has null scrollToEventId by default', () => {
      const { result } = renderHook(() => useTimelineFilter());

      expect(result.current.scrollToEventId).toBeNull();
    });

    it('has hasActiveFilter as false by default', () => {
      const { result } = renderHook(() => useTimelineFilter());

      expect(result.current.hasActiveFilter).toBe(false);
    });
  });

  describe('setCategory', () => {
    it('sets activeCategory to session', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setCategory('session');
      });

      expect(result.current.activeCategory).toBe('session');
    });

    it('sets activeCategory to financial', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setCategory('financial');
      });

      expect(result.current.activeCategory).toBe('financial');
    });

    it('sets activeCategory to gaming', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setCategory('gaming');
      });

      expect(result.current.activeCategory).toBe('gaming');
    });

    it('sets activeCategory to loyalty', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setCategory('loyalty');
      });

      expect(result.current.activeCategory).toBe('loyalty');
    });

    it('sets activeCategory to compliance', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setCategory('compliance');
      });

      expect(result.current.activeCategory).toBe('compliance');
    });

    it('sets activeCategory to note', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setCategory('note');
      });

      expect(result.current.activeCategory).toBe('note');
    });

    it('sets activeCategory to null to clear filter', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setCategory('session');
      });

      expect(result.current.activeCategory).toBe('session');

      act(() => {
        result.current.setCategory(null);
      });

      expect(result.current.activeCategory).toBeNull();
    });

    it('updates hasActiveFilter when category is set', () => {
      const { result } = renderHook(() => useTimelineFilter());

      expect(result.current.hasActiveFilter).toBe(false);

      act(() => {
        result.current.setCategory('session');
      });

      expect(result.current.hasActiveFilter).toBe(true);
    });
  });

  describe('setTimeLens', () => {
    it('sets timeLens to 30d', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setTimeLens('30d');
      });

      expect(result.current.timeLens).toBe('30d');
    });

    it('sets timeLens to 90d', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setTimeLens('90d');
      });

      expect(result.current.timeLens).toBe('90d');
    });

    it('sets timeLens to 12w', () => {
      const { result } = renderHook(() => useTimelineFilter());

      // Set to something else first
      act(() => {
        result.current.setTimeLens('30d');
      });

      act(() => {
        result.current.setTimeLens('12w');
      });

      expect(result.current.timeLens).toBe('12w');
    });
  });

  describe('clearFilter', () => {
    it('sets activeCategory to null', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setCategory('session');
      });

      expect(result.current.activeCategory).toBe('session');

      act(() => {
        result.current.clearFilter();
      });

      expect(result.current.activeCategory).toBeNull();
    });

    it('does not change timeLens', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setTimeLens('30d');
      });

      act(() => {
        result.current.clearFilter();
      });

      expect(result.current.timeLens).toBe('30d');
    });

    it('sets hasActiveFilter to false', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setCategory('session');
      });

      expect(result.current.hasActiveFilter).toBe(true);

      act(() => {
        result.current.clearFilter();
      });

      expect(result.current.hasActiveFilter).toBe(false);
    });
  });

  describe('scrollToEvent', () => {
    it('sets scrollToEventId', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.scrollToEvent('event-123');
      });

      expect(result.current.scrollToEventId).toBe('event-123');
    });

    it('can be called multiple times', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.scrollToEvent('event-1');
      });

      expect(result.current.scrollToEventId).toBe('event-1');

      act(() => {
        result.current.scrollToEvent('event-2');
      });

      expect(result.current.scrollToEventId).toBe('event-2');
    });
  });

  describe('clearScrollTarget', () => {
    it('sets scrollToEventId to null', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.scrollToEvent('event-123');
      });

      expect(result.current.scrollToEventId).toBe('event-123');

      act(() => {
        result.current.clearScrollTarget();
      });

      expect(result.current.scrollToEventId).toBeNull();
    });
  });

  describe('state persistence', () => {
    it('maintains state across hook re-renders', () => {
      const { result, rerender } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setCategory('financial');
        result.current.setTimeLens('90d');
      });

      rerender();

      expect(result.current.activeCategory).toBe('financial');
      expect(result.current.timeLens).toBe('90d');
    });

    it('shares state between multiple hook instances', () => {
      const { result: result1 } = renderHook(() => useTimelineFilter());
      const { result: result2 } = renderHook(() => useTimelineFilter());

      act(() => {
        result1.current.setCategory('loyalty');
      });

      // Both hooks should see the same state
      expect(result1.current.activeCategory).toBe('loyalty');
      expect(result2.current.activeCategory).toBe('loyalty');
    });
  });

  describe('derived state', () => {
    it('hasActiveFilter is true when category is set', () => {
      const { result } = renderHook(() => useTimelineFilter());

      const categories: SourceCategory[] = [
        'session',
        'gaming',
        'financial',
        'loyalty',
        'compliance',
        'note',
      ];

      categories.forEach((category) => {
        act(() => {
          result.current.setCategory(category);
        });

        expect(result.current.hasActiveFilter).toBe(true);
      });
    });

    it('hasActiveFilter is false when category is null', () => {
      const { result } = renderHook(() => useTimelineFilter());

      act(() => {
        result.current.setCategory(null);
      });

      expect(result.current.hasActiveFilter).toBe(false);
    });
  });

  describe('zustand store direct access', () => {
    it('provides same interface through store', () => {
      const { result } = renderHook(() => useTimelineFilterStore());

      expect(result.current).toHaveProperty('activeCategory');
      expect(result.current).toHaveProperty('timeLens');
      expect(result.current).toHaveProperty('scrollToEventId');
      expect(result.current).toHaveProperty('setCategory');
      expect(result.current).toHaveProperty('setTimeLens');
      expect(result.current).toHaveProperty('clearFilter');
      expect(result.current).toHaveProperty('scrollToEvent');
      expect(result.current).toHaveProperty('clearScrollTarget');
    });

    it('store actions work directly', () => {
      const { result } = renderHook(() => useTimelineFilterStore());

      act(() => {
        result.current.setCategory('session');
      });

      expect(result.current.activeCategory).toBe('session');
    });
  });

  describe('type safety', () => {
    it('only accepts valid SourceCategory values', () => {
      const { result } = renderHook(() => useTimelineFilter());

      // These should all work (compile-time check)
      const validCategories: (SourceCategory | null)[] = [
        'session',
        'gaming',
        'financial',
        'loyalty',
        'compliance',
        'note',
        null,
      ];

      validCategories.forEach((category) => {
        act(() => {
          result.current.setCategory(category);
        });

        expect(result.current.activeCategory).toBe(category);
      });
    });

    it('only accepts valid TimeLensRange values', () => {
      const { result } = renderHook(() => useTimelineFilter());

      const validRanges = ['30d', '90d', '12w'] as const;

      validRanges.forEach((range) => {
        act(() => {
          result.current.setTimeLens(range);
        });

        expect(result.current.timeLens).toBe(range);
      });
    });
  });
});
