'use client';

/**
 * Recognition query hook — company-scoped player lookup.
 *
 * Wraps lookupPlayerCompany() with debounce, min-length guard, and staleTime.
 *
 * @see PRD-051 / EXEC-051 WS4
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { lookupPlayerCompany, recognitionKeys } from '@/services/recognition';
import type { RecognitionResultDTO } from '@/services/recognition';

export function useRecognitionLookup(searchTerm: string) {
  const [debouncedTerm, setDebouncedTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm.length >= 2 ? searchTerm : '');
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  return useQuery<RecognitionResultDTO[]>({
    queryKey: recognitionKeys.lookup(debouncedTerm),
    queryFn: () => lookupPlayerCompany(debouncedTerm),
    enabled: debouncedTerm.length >= 2,
    staleTime: 30_000,
  });
}
