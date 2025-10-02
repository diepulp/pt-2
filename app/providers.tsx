'use client'

import { ThemeProvider } from 'next-themes'
import { HeroUIProvider } from '@heroui/react'
import { Toaster } from '@/components/landing-page/ui/toaster'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <HeroUIProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster />
      </ThemeProvider>
    </HeroUIProvider>
  )
}