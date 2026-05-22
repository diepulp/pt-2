import { render, screen, within } from '@testing-library/react';

import { FinancialValue } from '../FinancialValue';
import type { FinancialValue as FinancialValueType } from '@/types/financial';

function makeValue(
  overrides: Partial<FinancialValueType> = {},
): FinancialValueType {
  return {
    value: 1050,
    type: 'actual',
    source: 'PFT',
    completeness: { status: 'complete' },
    ...overrides,
  };
}

describe('FinancialValue', () => {
  // Assertion 1: Integer-cents formatting
  it('formats integer cents correctly — 1050 renders as $10.50', () => {
    render(
      <FinancialValue value={makeValue({ value: 1050 })} label="Cash In" />,
    );
    expect(screen.getByText('$10.50')).toBeInTheDocument();
  });

  it('formats large cent values correctly — 150000 renders as $1,500.00', () => {
    render(
      <FinancialValue value={makeValue({ value: 150000 })} label="Drop" />,
    );
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
  });

  it('does not render raw cent integer as dollar amount — 1050 does not appear as $1,050', () => {
    render(
      <FinancialValue value={makeValue({ value: 1050 })} label="Cash In" />,
    );
    expect(screen.queryByText('$1,050')).not.toBeInTheDocument();
    expect(screen.queryByText('$0.01050')).not.toBeInTheDocument();
  });

  // Assertion 2: Visible authority
  it('renders "Actual" authority badge for type=actual', () => {
    render(
      <FinancialValue value={makeValue({ type: 'actual' })} label="Cash In" />,
    );
    expect(screen.getByText(/Actual/i)).toBeInTheDocument();
  });

  it('renders "Estimated" authority badge for type=estimated', () => {
    render(
      <FinancialValue value={makeValue({ type: 'estimated' })} label="Drop" />,
    );
    // Use getAllByText since the badge renders "Estimated" as a standalone token
    const matches = screen.getAllByText(/Estimated/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Observed" authority badge for type=observed', () => {
    render(
      <FinancialValue
        value={makeValue({ type: 'observed' })}
        label="Alert Value"
      />,
    );
    const matches = screen.getAllByText(/Observed/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Compliance" authority badge for type=compliance', () => {
    render(
      <FinancialValue
        value={makeValue({ type: 'compliance' })}
        label="MTL Total"
      />,
    );
    expect(screen.getByText(/Compliance/i)).toBeInTheDocument();
  });

  // Assertion 3: Visible source text
  it('renders value.source as visible text in the output', () => {
    render(
      <FinancialValue value={makeValue({ source: 'PFT' })} label="Cash In" />,
    );
    expect(screen.getByText('PFT')).toBeInTheDocument();
  });

  it('renders non-standard source strings as visible text', () => {
    render(
      <FinancialValue
        value={makeValue({ source: 'rating_slip.theo' })}
        label="Theo"
      />,
    );
    expect(screen.getByText('rating_slip.theo')).toBeInTheDocument();
  });

  // Assertion 4: Visible completeness — distinct text for each status
  it('renders distinct text for completeness status=complete', () => {
    render(
      <FinancialValue
        value={makeValue({ completeness: { status: 'complete' } })}
        label="Cash In"
      />,
    );
    // complete status does not add extra completeness text — the value itself is shown
    expect(screen.getByText('$10.50')).toBeInTheDocument();
    expect(screen.queryByText(/Unknown/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Partial/i)).not.toBeInTheDocument();
  });

  it('renders "Partial" text for completeness status=partial', () => {
    render(
      <FinancialValue
        value={makeValue({ completeness: { status: 'partial' } })}
        label="Cash In"
      />,
    );
    expect(screen.getByText(/Partial/i)).toBeInTheDocument();
  });

  it('renders distinct "Not computed" text for completeness status=unknown', () => {
    render(
      <FinancialValue
        value={makeValue({ completeness: { status: 'unknown' } })}
        label="Theo"
      />,
    );
    expect(screen.getByText(/Not computed/i)).toBeInTheDocument();
  });

  // Assertion 5: Unknown completeness never renders $0 or blank
  it('does not render $0 for unknown completeness', () => {
    render(
      <FinancialValue
        value={makeValue({ value: 0, completeness: { status: 'unknown' } })}
        label="Theo"
      />,
    );
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
    expect(screen.getByText(/Not computed/i)).toBeInTheDocument();
  });

  it('does not render blank for unknown completeness', () => {
    const { container } = render(
      <FinancialValue
        value={makeValue({ completeness: { status: 'unknown' } })}
        label="Theo"
      />,
    );
    const valueContainer = container.querySelector(
      '[data-testid="financial-value"]',
    );
    expect(valueContainer).not.toBeEmptyDOMElement();
    expect(screen.getByText(/Not computed/i)).toBeInTheDocument();
  });

  // Assertion 6: Compliance isolation
  it('renders compliance violation indicator when compliance type has operational derivedFrom', () => {
    render(
      <FinancialValue
        value={makeValue({ type: 'compliance', value: 50000 })}
        label="MTL"
        derivedFrom={['actual', 'estimated']}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Compliance Mix Violation/i)).toBeInTheDocument();
  });

  it('compliance type without problematic derivedFrom renders normally', () => {
    render(
      <FinancialValue
        value={makeValue({ type: 'compliance', value: 50000 })}
        label="MTL Total"
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/Compliance/i)).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  // Assertion 7: Pattern A split display
  it('Pattern A — two instances side-by-side render distinct authority labels', () => {
    render(
      <div>
        <FinancialValue
          value={makeValue({ type: 'actual', value: 100000 })}
          label="Rated"
        />
        <FinancialValue
          value={makeValue({ type: 'estimated', value: 80000 })}
          label="Unrated"
        />
      </div>,
    );
    const actualBadges = screen.getAllByText(/Actual/i);
    const estimatedBadges = screen.getAllByText(/Estimated/i);
    expect(actualBadges.length).toBeGreaterThanOrEqual(1);
    expect(estimatedBadges.length).toBeGreaterThanOrEqual(1);
    // Verify both authority labels coexist in the DOM (distinct)
    expect(actualBadges[0]).not.toBe(estimatedBadges[0]);
  });

  // Assertion 8: Pattern B derived — degraded authority visible
  it('Pattern B — derivedFrom causes "Derived" prefix in authority badge', () => {
    render(
      <FinancialValue
        value={makeValue({ type: 'estimated', value: 50000 })}
        label="Net"
        derivedFrom={['total_buy_in', 'total_cash_out']}
      />,
    );
    // The authority badge shows "Derived / Estimated"
    expect(screen.getByText(/Derived/i)).toBeInTheDocument();
    expect(screen.getByText(/Estimated/i)).toBeInTheDocument();
  });

  it('Pattern B — derivedFrom fields appear in rendered output', () => {
    render(
      <FinancialValue
        value={makeValue({ type: 'estimated', value: 50000 })}
        label="Table Win"
        derivedFrom={[
          'opening_total_cents',
          'fills_total_cents',
          'credits_total_cents',
        ]}
      />,
    );
    const derivedContainer = screen.getByTestId('financial-value');
    expect(
      within(derivedContainer).getByText(/opening_total_cents/),
    ).toBeInTheDocument();
  });

  it('Pattern B — without derivedFrom, "Derived" text is absent', () => {
    render(
      <FinancialValue
        value={makeValue({ type: 'actual', value: 50000 })}
        label="Cash In"
      />,
    );
    expect(screen.queryByText(/Derived/i)).not.toBeInTheDocument();
  });

  // Coverage display
  it('renders coverage percentage when coverage is provided', () => {
    render(
      <FinancialValue
        value={makeValue({
          completeness: { status: 'partial', coverage: 0.75 },
        })}
        label="Win/Loss"
      />,
    );
    expect(screen.getByText(/75%/)).toBeInTheDocument();
  });
});
