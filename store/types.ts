/**
 * Store utility types for ADR-035 Session Reset Contract.
 *
 * @see ADR-035 INV-035-1: Typed INITIAL_STATE constants
 */

/**
 * Extracts data-only fields from a store interface,
 * auto-excluding function (action) fields.
 * Used for typed INITIAL_STATE constants per INV-035-1.
 */
export type DataOnly<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => unknown
    ? never
    : K]: T[K];
};
