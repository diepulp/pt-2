'use client';

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
    <nav role="navigation" aria-label="Setup wizard progress">
      {/* Step circles with connecting lines */}
      <div className="flex items-center justify-between">
        {steps.map((label, idx) => {
          const isComplete = idx < currentStep;
          const isCurrent = idx === currentStep;
          const isClickable = isComplete && onStepClick != null;

          const circleClasses = `flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
            isComplete
              ? 'bg-accent text-accent-foreground'
              : isCurrent
                ? 'border-2 border-accent text-accent'
                : 'border-2 border-border/50 text-muted-foreground'
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

          const circle = (
            <div className={circleClasses}>
              {isComplete ? checkIcon : idx + 1}
            </div>
          );

          return (
            <div
              key={label}
              className="flex flex-1 items-center last:flex-none"
            >
              {isClickable ? (
                <button
                  type="button"
                  className="shrink-0 cursor-pointer transition-opacity hover:opacity-80"
                  onClick={() => onStepClick(idx)}
                  aria-label={`Go to ${label}`}
                >
                  {circle}
                </button>
              ) : (
                <div
                  className="shrink-0"
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {circle}
                </div>
              )}
              {idx < steps.length - 1 && (
                <div
                  className={`mx-2 h-px flex-1 ${isComplete ? 'bg-accent' : 'bg-border/50'}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Labels row — below circles */}
      <div className="mt-2 flex justify-between">
        {steps.map((label, idx) => {
          const isComplete = idx < currentStep;
          const isCurrent = idx === currentStep;
          const isOptional = optionalSteps.includes(idx);

          return (
            <div
              key={label}
              className="flex-1 last:flex-none text-center last:text-right first:text-left"
            >
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isCurrent
                    ? 'text-foreground'
                    : isComplete
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/50'
                }`}
                style={{ fontFamily: 'monospace' }}
              >
                {label}
                {isOptional && (
                  <span className="ml-0.5 text-muted-foreground/40">*</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
