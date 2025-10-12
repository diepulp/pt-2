/**
 * Service Mutation Hook Template
 * Following PT-2 canonical architecture
 *
 * Generic hook for React Query mutations that integrate with PT-2's
 * ServiceResult<T> pattern from server actions.
 *
 * Key features:
 * - Maps ServiceResult<T> to React Query mutation results
 * - Handles success/error transformation automatically
 * - Supports cache invalidation via queryClient
 * - Full TypeScript generics for type safety
 * - Compatible with withServerAction wrapper pattern
 *
 * @example
 * ```typescript
 * const createPlayer = useServiceMutation(
 *   createPlayerAction,
 *   {
 *     onSuccess: () => {
 *       queryClient.invalidateQueries({ queryKey: ['player'] })
 *     }
 *   }
 * )
 *
 * createPlayer.mutate({ email: 'test@example.com', ... })
 * ```
 */

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

import type { ServiceResult } from "@/services/shared/types";

/**
 * Generic mutation hook for server actions that return ServiceResult<T>
 *
 * @template TData - The success data type from ServiceResult<T>
 * @template TVariables - The input variables type for the mutation
 * @template TError - The error type (defaults to Error)
 *
 * @param mutationFn - Server action that returns Promise<ServiceResult<TData>>
 * @param options - React Query mutation options (excluding mutationFn)
 *
 * @returns React Query mutation result with transformed data/error
 *
 * @example
 * ```typescript
 * // Create mutation
 * const createPlayer = useServiceMutation(
 *   createPlayerAction,
 *   {
 *     onSuccess: (data) => {
 *       // data is the unwrapped success data
 *       queryClient.invalidateQueries({ queryKey: ['player'] })
 *     },
 *     onError: (error) => {
 *       // error is the ServiceError
 *       toast.error(error.message)
 *     }
 *   }
 * )
 *
 * // Trigger mutation
 * createPlayer.mutate({
 *   email: 'test@example.com',
 *   firstName: 'John',
 *   lastName: 'Doe'
 * })
 * ```
 */
export function useServiceMutation<TData, TVariables, TError = Error>(
  mutationFn: (variables: TVariables) => Promise<ServiceResult<TData>>,
  options?: Omit<UseMutationOptions<TData, TError, TVariables>, "mutationFn">,
) {
  return useMutation<TData, TError, TVariables>({
    mutationFn: async (variables: TVariables) => {
      const result = await mutationFn(variables);

      if (!result.success || result.error) {
        // Transform ServiceError to Error for React Query
        const error = new Error(result.error?.message || "Mutation failed");
        // Attach the full ServiceError for detailed error handling
        (error as Error & { details?: unknown }).details = result.error;
        throw error;
      }

      // Return unwrapped data on success
      // TypeScript knows this is TData because success=true means data is not null
      return result.data as TData;
    },
    ...options,
  });
}
