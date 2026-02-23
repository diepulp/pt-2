/**
 * Column Mapping Hook
 *
 * Manages the mapping state between vendor CSV headers and canonical PT-2 fields.
 * Supports auto-detection and manual override.
 *
 * @see PRD-037 CSV Player Import
 * @see lib/csv/column-auto-detect.ts
 */

'use client';

import { useState } from 'react';

import {
  autoDetectMappings,
  type CanonicalField,
} from '@/lib/csv/column-auto-detect';

export interface ColumnMappingState {
  /** canonical field → vendor CSV header */
  mappings: Record<string, string>;
  /** Number of fields auto-detected */
  autoDetectedCount: number;
  /** Whether at least one identifier (email or phone) is mapped */
  isValid: boolean;
}

/**
 * Hook for managing column mapping between CSV headers and canonical fields.
 *
 * Provides auto-detect from headers, manual set/unset, and validation
 * that at least one identifier (email or phone) is mapped.
 */
export function useColumnMapping() {
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [autoDetectedCount, setAutoDetectedCount] = useState(0);

  const hasIdentifier =
    ('email' in mappings &&
      mappings.email !== undefined &&
      mappings.email.length > 0) ||
    ('phone' in mappings &&
      mappings.phone !== undefined &&
      mappings.phone.length > 0);

  /**
   * Auto-detect mappings from CSV headers.
   * Replaces all current mappings with auto-detected results.
   */
  function detectFromHeaders(headers: string[]) {
    const detected = autoDetectMappings(headers);
    setMappings(detected);
    setAutoDetectedCount(Object.keys(detected).length);
  }

  /**
   * Set a single mapping (canonical field → CSV header).
   * Pass empty string to unmap a field.
   */
  function setMapping(canonicalField: CanonicalField, csvHeader: string) {
    setMappings((prev) => {
      const next = { ...prev };
      if (csvHeader === '') {
        delete next[canonicalField];
      } else {
        next[canonicalField] = csvHeader;
      }
      return next;
    });
  }

  /** Reset all mappings */
  function resetMappings() {
    setMappings({});
    setAutoDetectedCount(0);
  }

  const state: ColumnMappingState = {
    mappings,
    autoDetectedCount,
    isValid: hasIdentifier,
  };

  return {
    ...state,
    detectFromHeaders,
    setMapping,
    resetMappings,
  };
}
