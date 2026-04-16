'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

import { Reveal } from './reveal';

interface ProductSurface {
  label: string;
  title: string;
  description: string;
}

export function ProductTabs({ surfaces }: { surfaces: ProductSurface[] }) {
  const [active, setActive] = useState(0);

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr] overflow-hidden">
      {/* Tab selector */}
      <Reveal className="min-w-0 overflow-hidden">
        <div className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {surfaces.map((surface, i) => (
            <button
              key={surface.label}
              onClick={() => setActive(i)}
              className={cn(
                'group flex-shrink-0 flex flex-col rounded-xl border px-4 py-3.5 text-left transition-all duration-300',
                i === active
                  ? 'border-accent/30 bg-accent/[0.06]'
                  : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.02]',
              )}
            >
              <span
                className={cn(
                  'font-mono text-[10px] tracking-[0.12em] transition-colors',
                  i === active ? 'text-accent/80' : 'text-[#95A2B3]/40',
                )}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span
                className={cn(
                  'mt-1 text-[13px] font-medium whitespace-nowrap transition-colors',
                  i === active ? 'text-[#F7F8F8]' : 'text-[#95A2B3]/70',
                )}
              >
                {surface.label}
              </span>
            </button>
          ))}
        </div>
      </Reveal>

      {/* Display panel */}
      <Reveal delay={100} className="min-w-0 overflow-hidden">
        <div className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] transition-all duration-500 hover:border-accent/20">
          {/* Hover glow */}
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            style={{
              background:
                'radial-gradient(ellipse at center, hsl(189 94% 43% / 0.04), transparent 70%)',
            }}
          />

          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          <div className="relative flex aspect-[4/3] sm:aspect-[16/10] flex-col items-center justify-center p-5 sm:p-10">
            <div className="text-center w-full">
              <p className="font-mono text-[10px] tracking-[0.15em] text-accent/50 mb-4 sm:mb-6">
                {surfaces[active].label.toUpperCase()}
              </p>
              <p className="text-base sm:text-lg font-semibold text-[#F7F8F8] mb-2 sm:mb-3">
                {surfaces[active].title}
              </p>
              <p className="text-[13px] sm:text-sm leading-relaxed text-[#95A2B3]/70">
                {surfaces[active].description}
              </p>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
