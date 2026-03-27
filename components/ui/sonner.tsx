'use client';

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * PT-2 Toaster — accent-colored, high-contrast toast notifications.
 *
 * Uses Sonner's `richColors` mode with PT-2 themed CSS variable overrides
 * (defined in globals.css) so variant toasts have strong visual identity
 * in both light and dark themes.
 *
 * Adds a left-border accent + elevated shadow so toasts remain visible
 * over Sheet overlays (e.g. the activation drawer / custody chain drawer).
 *
 * @see app/globals.css — PT-2 Sonner Toast Overrides section
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      richColors
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'border-l-4 shadow-lg',
          success: '!border-l-green-500',
          error: '!border-l-red-500',
          warning: '!border-l-amber-500',
          info: '!border-l-blue-500',
          description: 'opacity-80',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
