/**
 * Reusable test utilities and custom render functions
 */

import { render, RenderOptions } from '@testing-library/react'
import { ReactElement, ReactNode } from 'react'

/**
 * Custom render function with common providers
 * Extend this as you add global providers (theme, query client, etc.)
 */
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  // Add provider props here as needed
}

function AllTheProviders({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Add global providers here:
          - ThemeProvider
          - QueryClientProvider (if using React Query)
          - Any context providers
      */}
      {children}
    </>
  )
}

export function customRender(ui: ReactElement, options?: CustomRenderOptions) {
  return render(ui, { wrapper: AllTheProviders, ...options })
}

// Re-export everything from RTL
export * from '@testing-library/react'

// Override render with custom version
export { customRender as render }

/**
 * Wait for async operations with timeout
 * Usage: await waitFor(() => expect(element).toBeInTheDocument())
 */
export { waitFor } from '@testing-library/react'

/**
 * User event utilities for realistic user interactions
 * Usage: await userEvent.click(button)
 */
export { default as userEvent } from '@testing-library/user-event'
