'use client';

import { Separator } from '@/components/ui/separator';

interface WizardStepperProps {
  steps: readonly string[];
  currentStep: number;
}

export function WizardStepper({ steps, currentStep }: WizardStepperProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      {steps.map((label, idx) => {
        const isComplete = idx < currentStep;
        const isCurrent = idx === currentStep;

        return (
          <div
            key={label}
            className="flex items-center gap-2 flex-1 last:flex-initial"
          >
            <div className="flex items-center gap-2 shrink-0">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  isComplete
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'border-2 border-primary text-primary'
                      : 'border border-muted-foreground/30 text-muted-foreground'
                }`}
              >
                {isComplete ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={`hidden text-xs sm:inline ${
                  isCurrent
                    ? 'font-medium text-foreground'
                    : isComplete
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/60'
                }`}
              >
                {label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <Separator
                className={`flex-1 ${isComplete ? 'bg-primary' : 'bg-muted'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
