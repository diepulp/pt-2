'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * Lightweight reveal-on-scroll wrapper.
 * Uses a single shared IntersectionObserver for all instances on the page.
 */

const OBSERVED = new WeakSet<Element>();
let sharedObserver: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver {
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          sharedObserver!.unobserve(entry.target);
          OBSERVED.delete(entry.target);
        }
      }
    },
    { threshold: 0.1 },
  );
  return sharedObserver;
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = getObserver();
    OBSERVED.add(el);
    obs.observe(el);

    return () => {
      if (OBSERVED.has(el)) {
        obs.unobserve(el);
        OBSERVED.delete(el);
      }
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out',
        'opacity-0 translate-y-6 [&.revealed]:opacity-100 [&.revealed]:translate-y-0',
        className,
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
