'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

import { Reveal } from './reveal';

interface ProductSurface {
  label: string;
  icon?: React.ReactNode;
  iconCls?: string;
  iconClsMuted?: string;
  title: string;
  description: string;
  stub?: string;
  screenshotSrc?: string;
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
                'group flex-shrink-0 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left transition-all duration-300',
                i === active
                  ? 'border-accent/30 bg-accent/[0.06]'
                  : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.02]',
              )}
            >
              {surface.icon && (
                <span
                  className={cn(
                    'flex-shrink-0 flex size-7 items-center justify-center rounded-lg border transition-all duration-300',
                    i === active ? surface.iconCls : surface.iconClsMuted,
                  )}
                >
                  {surface.icon}
                </span>
              )}
              <span
                className={cn(
                  'text-[13px] font-medium whitespace-nowrap transition-colors',
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
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 z-10"
            style={{
              background:
                'radial-gradient(ellipse at center, hsl(189 94% 43% / 0.04), transparent 70%)',
            }}
          />

          {surfaces[active].screenshotSrc ? (
            /* Screenshot view */
            <>
              <div className="relative overflow-hidden">
                <img
                  src={surfaces[active].screenshotSrc}
                  alt={surfaces[active].label}
                  className="w-full block"
                  loading="lazy"
                />
                {/* Bottom fade into footer */}
                <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-[#000212]/60 to-transparent pointer-events-none" />
              </div>
              <div className="relative px-5 py-4 border-t border-white/[0.06] bg-white/[0.01]">
                <p className="font-mono text-[10px] tracking-[0.15em] text-accent/50 mb-1.5">
                  {surfaces[active].label.toUpperCase()}
                </p>
                <p className="text-[13px] font-semibold text-[#F7F8F8] mb-0.5">
                  {surfaces[active].title}
                </p>
                <p className="text-[12px] leading-relaxed text-[#95A2B3]/60">
                  {surfaces[active].description}
                </p>
              </div>
            </>
          ) : (
            /* Stub / placeholder view */
            <>
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
                <div className="text-center w-full max-w-lg mx-auto">
                  <p className="font-mono text-[10px] tracking-[0.15em] text-accent/50 mb-4 sm:mb-6">
                    {surfaces[active].label.toUpperCase()}
                  </p>
                  {surfaces[active].stub && (
                    <div className="mb-5 sm:mb-8 rounded-lg border border-dashed border-white/[0.12] px-4 py-3">
                      <p className="font-mono text-[10px] tracking-[0.12em] text-[#95A2B3]/40">
                        {surfaces[active].stub}
                      </p>
                    </div>
                  )}
                  <p className="text-base sm:text-lg font-semibold text-[#F7F8F8] mb-2 sm:mb-3">
                    {surfaces[active].title}
                  </p>
                  <p className="text-[13px] sm:text-sm leading-relaxed text-[#95A2B3]/70">
                    {surfaces[active].description}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </Reveal>
    </div>
  );
}
