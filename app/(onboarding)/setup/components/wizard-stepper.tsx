'use client';

import { Separator } from '@/components/ui/separator';

interface WizardStepperProps {
  steps: readonly string[];
  currentStep: number;
  onStepClick?: (step: number) => void;
  optionalSteps?: number[];
}

export function WizardStepper({
  steps,
  currentStep,
  onStepClick,
  optionalSteps = [],
}: WizardStepperProps) {
  return (
    <nav
      role="navigation"
      aria-label="Setup wizard progress"
      className="flex items-center justify-between gap-2"
    >
      {steps.map((label, idx) => {
        const isComplete = idx < currentStep;
        const isCurrent = idx === currentStep;
        const isClickable = isComplete && onStepClick != null;
        const isOptional = optionalSteps.includes(idx);

        const circleClasses = `flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
          isComplete
            ? 'bg-primary text-primary-foreground'
            : isCurrent
              ? 'border-2 border-primary text-primary'
              : 'border border-muted-foreground/30 text-muted-foreground'
        }`;

        const labelClasses = `hidden text-xs sm:inline ${
          isCurrent
            ? 'font-medium text-foreground'
            : isComplete
              ? 'text-muted-foreground'
              : 'text-muted-foreground/60'
        }`;

        const checkIcon = (
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
        );

        const stepContent = (
          <>
            <div className={circleClasses}>
              {isComplete ? checkIcon : idx + 1}
            </div>
            <span className={labelClasses}>
              {label}
              {isOptional && (
                <span className="ml-1 text-muted-foreground/60">
                  (Optional)
                </span>
              )}
            </span>
          </>
        );

        return (
          <div
            key={label}
            className="flex items-center gap-2 flex-1 last:flex-initial"
          >
            {isClickable ? (
              <button
                type="button"
                className="flex items-center gap-2 shrink-0 cursor-pointer transition-opacity hover:opacity-80"
                onClick={() => onStepClick(idx)}
                aria-label={`Go to ${label}`}
              >
                {stepContent}
              </button>
            ) : (
              <div
                className="flex items-center gap-2 shrink-0"
                aria-current={isCurrent ? 'step' : undefined}
              >
                {stepContent}
              </div>
            )}
            {idx < steps.length - 1 && (
              <Separator
                className={`flex-1 ${isComplete ? 'bg-primary' : 'bg-muted'}`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
