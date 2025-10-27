'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Test page to verify React Query setup
 * To test: navigate to /react-query-test in browser
 * Expected: "Test Query Result: Hello React Query!" and no console errors
 */
export default function ReactQueryTestPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['test-query'],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return 'Hello React Query!';
    },
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">React Query Test Page</h1>
      {isLoading && <p>Loading...</p>}
      {error && <p className="text-red-500">Error: {String(error)}</p>}
      {data && (
        <div className="space-y-2">
          <p className="text-green-600 font-semibold">
            ✅ Test Query Result: {data}
          </p>
          <p className="text-sm text-gray-600">
            React Query is working correctly!
          </p>
          <p className="text-sm text-gray-500">
            Open DevTools (bottom right icon) to inspect queries
          </p>
        </div>
      )}
    </div>
  );
}
