'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, toast } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * PT-2 Sonner Toast Component
 *
 * Industrial-styled toast notifications for the pit management system.
 * Uses monospace font for operational clarity and high-contrast colors.
 *
 * Features:
 * - Staggered stack: Toasts collapse when idle, expand on hover
 * - Rich colors: Semantic colors for success/error/warning/info
 * - Close button: Manual dismissal available
 *
 * @see sonner documentation: https://sonner.emilkowal.ski
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position="bottom-right"
      expand={false}
      richColors
      closeButton
      gap={8}
      visibleToasts={5}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-zinc-900 group-[.toaster]:text-zinc-100 group-[.toaster]:border group-[.toaster]:border-zinc-700/50 group-[.toaster]:shadow-2xl group-[.toaster]:font-mono group-[.toaster]:text-sm group-[.toaster]:backdrop-blur-sm',
          description: 'group-[.toast]:text-zinc-400 group-[.toast]:text-xs',
          actionButton:
            'group-[.toast]:bg-zinc-100 group-[.toast]:text-zinc-900 group-[.toast]:font-medium',
          cancelButton:
            'group-[.toast]:bg-zinc-800 group-[.toast]:text-zinc-300',
          closeButton:
            'group-[.toast]:bg-zinc-800 group-[.toast]:border-zinc-700 group-[.toast]:text-zinc-400 group-[.toast]:hover:bg-zinc-700 group-[.toast]:hover:text-zinc-100',
          error:
            'group-[.toaster]:!bg-zinc-900 group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-red-500 group-[.toaster]:!border-y-zinc-700/50 group-[.toaster]:!border-r-zinc-700/50 group-[.toaster]:!text-zinc-100',
          success:
            'group-[.toaster]:!bg-emerald-950/95 group-[.toaster]:!border-emerald-800/60 group-[.toaster]:!text-emerald-100',
          warning:
            'group-[.toaster]:!bg-amber-950/95 group-[.toaster]:!border-amber-800/60 group-[.toaster]:!text-amber-100',
          info:
            'group-[.toaster]:!bg-blue-950/95 group-[.toaster]:!border-blue-800/60 group-[.toaster]:!text-blue-100',
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
