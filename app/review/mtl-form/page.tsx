"use client";

import { MtlEntryForm } from "./mtl-entry-form";

export default function MtlFormReviewPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Industrial grid pattern overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.015] dark:opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-8 bg-accent rounded-full" />
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">
                    Multiple Transaction Log
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Pit Cash Activity Tracking
                  </p>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-6">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">
                    Gaming Day
                  </div>
                  <div className="font-mono text-sm font-medium">
                    {new Date().toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-right">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">
                    MTL Threshold
                  </div>
                  <div className="font-mono text-sm font-medium text-accent">
                    $3,000
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          <MtlEntryForm />
        </main>
      </div>
    </div>
  );
}
