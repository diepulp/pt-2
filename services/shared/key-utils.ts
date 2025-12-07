type KeyFilterPrimitive = string | number | boolean | null | undefined;

export type KeyFilterValue =
  | KeyFilterPrimitive
  | KeyFilterValue[]
  | { [key: string]: KeyFilterValue };

export type KeyFilter = Record<string, KeyFilterValue>;

export function serializeKeyFilters<T extends KeyFilter>(filters?: T): string {
  if (!filters) {
    return '[]';
  }

  const entries = Object.entries(filters).filter(
    ([, value]) => value !== undefined,
  );

  entries.sort(([a], [b]) => a.localeCompare(b));

  return JSON.stringify(entries);
}
