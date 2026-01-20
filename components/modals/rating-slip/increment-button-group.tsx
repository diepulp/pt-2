'use client';

import React from 'react';

import { Button } from '@/components/ui/button';

interface IncrementButton {
  amount: number;
  label: string;
}

interface IncrementButtonGroupProps {
  type: string;
  incrementButtons: readonly IncrementButton[];
  onIncrement: (type: string, amount: number) => void;
  className?: string;
}

export const IncrementButtonGroup: React.FC<IncrementButtonGroupProps> = ({
  type,
  incrementButtons,
  onIncrement,
  className = '',
}) => (
  <div className={`grid grid-cols-5 gap-2 mt-2 ${className}`}>
    {incrementButtons.map(({ amount, label }) => (
      <Button
        key={`${type}-${amount}`}
        onClick={() => onIncrement(type, amount)}
        variant="outline"
        size="sm"
      >
        {label}
      </Button>
    ))}
  </div>
);
