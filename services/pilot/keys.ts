import { serializeKeyFilters } from '@/services/shared/key-utils';

import type { PilotRequestFilters } from './dtos';

const ROOT = ['pilot'] as const;
const serialize = (filters: PilotRequestFilters = {}) =>
  serializeKeyFilters(filters);

export const pilotKeys = {
  root: ROOT,
  requests: Object.assign(
    (filters: PilotRequestFilters = {}) =>
      [...ROOT, 'requests', serialize(filters)] as const,
    { scope: [...ROOT, 'requests'] as const },
  ),
  requestDetail: (id: string) => [...ROOT, 'requests', 'detail', id] as const,
};
