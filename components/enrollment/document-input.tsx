"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface DocumentNumberInputProps {
  /** Current document number value (full number when editing, empty when blank) */
  value: string;
  /** Change handler for document number */
  onChange: (value: string) => void;
  /** Input label */
  label?: string;
  /** Input placeholder */
  placeholder?: string;
  /** Whether the input is required */
  required?: boolean;
  /** Additional class names */
  className?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Error message to display */
  error?: string;
  /** Input ID for label association */
  id?: string;
}

/**
 * Secure document number input with masking for identity enrollment.
 *
 * Security requirements (ADR-022):
 * - Never displays full document number in UI
 * - Shows masked value (****) followed by last 4 digits
 * - Uses password input type to prevent shoulder surfing
 * - Disables autocomplete for security
 *
 * @see EXEC-SPEC-022 Section 9.1
 */
export function DocumentNumberInput({
  value,
  onChange,
  label = "Document Number",
  placeholder = "Enter document number",
  required = false,
  className,
  disabled = false,
  error,
  id = "document-number",
}: DocumentNumberInputProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState(value);

  // Sync external value changes
  React.useEffect(() => {
    setInternalValue(value);
  }, [value]);

  // Compute display value:
  // - If empty: show nothing
  // - If editing: show full value (masked by password input)
  // - If not editing and has value: show masked pattern (****XXXX)
  const displayValue = React.useMemo(() => {
    if (isEditing) {
      return internalValue;
    }

    if (!internalValue || internalValue.length === 0) {
      return "";
    }

    // Extract last 4 characters
    const last4 = internalValue.slice(-4);
    return `****${last4}`;
  }, [internalValue, isEditing]);

  const handleFocus = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    // Propagate value on blur
    onChange(internalValue);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        type="password"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
