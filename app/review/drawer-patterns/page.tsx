'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

import { SheetPanelDemo } from './sheet-panel';
import { SidebarPanelDemo } from './sidebar-panel';

/**
 * Drawer Patterns Comparison
 *
 * Option A: Sidebar-based right panel (using shadcn Sidebar with side="right")
 * Option C: Sheet-based overlay drawer (using shadcn Sheet)
 */
export default function DrawerPatternsPage() {
  const [activePattern, setActivePattern] = useState<'sidebar' | 'sheet'>(
    'sidebar',
  );

  return (
    <div className="dark min-h-screen bg-[#0a0a0b] text-zinc-100">
      {/* Subtle grid pattern background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Header */}
      <header className="relative border-b border-zinc-800/60 bg-zinc-900/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 bg-amber-500/80 rounded-full" />
                <h1 className="text-lg font-medium tracking-tight text-zinc-100">
                  Drawer Pattern Comparison
                </h1>
              </div>
              <p className="text-sm text-zinc-500 ml-4 font-light">
                Evaluating right-panel implementations for Table Ops
              </p>
            </div>

            {/* Pattern Switcher */}
            <div className="flex items-center gap-1 p-1 bg-zinc-900/80 border border-zinc-800/60 rounded-lg">
              <button
                onClick={() => setActivePattern('sidebar')}
                className={cn(
                  'px-4 py-2 text-sm font-mono rounded-md transition-all duration-200',
                  activePattern === 'sidebar'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
                )}
              >
                Option A: Sidebar
              </button>
              <button
                onClick={() => setActivePattern('sheet')}
                className={cn(
                  'px-4 py-2 text-sm font-mono rounded-md transition-all duration-200',
                  activePattern === 'sheet'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
                )}
              >
                Option C: Sheet
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Pattern Info Bar */}
      <div className="border-b border-zinc-800/40 bg-zinc-900/20">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <PatternBadge
                label="Pattern"
                value={
                  activePattern === 'sidebar'
                    ? 'Sidebar Component'
                    : 'Sheet Component'
                }
              />
              <PatternBadge
                label="Behavior"
                value={
                  activePattern === 'sidebar'
                    ? 'Collapsible • Hover Expand'
                    : 'Modal Overlay • Toggle'
                }
              />
              <PatternBadge
                label="Z-Index"
                value={
                  activePattern === 'sidebar'
                    ? 'z-20 (layered)'
                    : 'z-50 (modal)'
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  activePattern === 'sidebar'
                    ? 'bg-emerald-500'
                    : 'bg-blue-500',
                )}
              />
              <span className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
                {activePattern === 'sidebar' ? 'Integrated' : 'Overlay'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Demo Container */}
      <main className="relative">
        <div className="max-w-7xl mx-auto p-8">
          {/* Preview Window */}
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 overflow-hidden shadow-2xl shadow-black/40">
            {/* Window Chrome */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/40 bg-zinc-900/60">
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-red-500/80 transition-colors" />
                  <div className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-amber-500/80 transition-colors" />
                  <div className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-emerald-500/80 transition-colors" />
                </div>
                <div className="h-4 w-px bg-zinc-800" />
                <span className="text-xs font-mono text-zinc-600">
                  {activePattern === 'sidebar'
                    ? 'components/pit-panels/sidebar-panel.tsx'
                    : 'components/pit-panels/sheet-panel.tsx'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-zinc-600">
                <span className="font-mono">Table: BJ-01</span>
                <span className="font-mono">•</span>
                <span className="font-mono">Gaming Day: 2024-12-18</span>
              </div>
            </div>

            {/* Demo Content */}
            <div className="h-[600px] relative">
              {activePattern === 'sidebar' ? (
                <SidebarPanelDemo />
              ) : (
                <SheetPanelDemo />
              )}
            </div>
          </div>

          {/* Comparison Table */}
          <div className="mt-8 grid grid-cols-2 gap-6">
            <ComparisonCard
              title="Option A: Sidebar"
              isActive={activePattern === 'sidebar'}
              pros={[
                'Unified with main AppSidebar component',
                'Consistent hover-expand behavior',
                'Shared underlay strip prevents bleed-through',
                'Native keyboard shortcuts (⌘B)',
                'Flexible collapsible modes (icon, offcanvas, none)',
              ]}
              cons={[
                'Requires custom z-index management',
                'Stacking context complexity with multiple sidebars',
                'More integration work with existing SidebarProvider',
              ]}
            />
            <ComparisonCard
              title="Option C: Sheet"
              isActive={activePattern === 'sheet'}
              pros={[
                'Battle-tested Radix Dialog primitive',
                'Built-in overlay scrim with animations',
                'Focus trapping and accessibility baked in',
                'Simple open/close state management',
                'No stacking context issues (modal layer)',
              ]}
              cons={[
                'Modal behavior blocks content interaction',
                'Different pattern than main sidebar',
                'Less integrated hover-to-expand behavior',
                'Full-page scrim may be too heavy for frequent use',
              ]}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/40 bg-zinc-900/20 mt-12">
        <div className="max-w-7xl mx-auto px-8 py-5">
          <div className="flex items-center justify-between text-xs text-zinc-600">
            <span>PT-2 Pit Station • Drawer Pattern Review</span>
            <span className="font-mono">Theme: Dark Industrial</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PatternBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-600 uppercase tracking-wider">
        {label}:
      </span>
      <span className="text-xs font-mono text-zinc-400 bg-zinc-800/50 px-2 py-0.5 rounded">
        {value}
      </span>
    </div>
  );
}

function ComparisonCard({
  title,
  isActive,
  pros,
  cons,
}: {
  title: string;
  isActive: boolean;
  pros: string[];
  cons: string[];
}) {
  return (
    <div
      className={cn(
        'p-6 rounded-lg border transition-all duration-300',
        isActive
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-zinc-800/40 bg-zinc-900/20',
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            isActive ? 'bg-amber-500' : 'bg-zinc-700',
          )}
        />
        <h3
          className={cn(
            'font-mono text-sm',
            isActive ? 'text-amber-400' : 'text-zinc-500',
          )}
        >
          {title}
        </h3>
        {isActive && (
          <span className="text-[10px] uppercase tracking-wider text-amber-500/60 ml-auto">
            Active
          </span>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-xs text-emerald-500/80 uppercase tracking-wider mb-2">
            Advantages
          </h4>
          <ul className="space-y-1.5">
            {pros.map((pro, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-zinc-400"
              >
                <span className="text-emerald-500/60 mt-0.5">+</span>
                {pro}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs text-red-500/80 uppercase tracking-wider mb-2">
            Trade-offs
          </h4>
          <ul className="space-y-1.5">
            {cons.map((con, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-zinc-500"
              >
                <span className="text-red-500/60 mt-0.5">−</span>
                {con}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
