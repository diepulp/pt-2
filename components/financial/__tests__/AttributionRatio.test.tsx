import { render, screen } from '@testing-library/react';

import { AttributionRatio } from '../AttributionRatio';

describe('AttributionRatio', () => {
  it('renders ratio 0.73 as a percentage with label "Attribution Ratio"', () => {
    render(<AttributionRatio ratio={0.73} />);
    expect(screen.getByText('73.0%')).toBeInTheDocument();
    expect(screen.getByText('Attribution Ratio')).toBeInTheDocument();
  });

  it('renders ratio 1.0 as 100.0%', () => {
    render(<AttributionRatio ratio={1.0} />);
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });

  it('renders ratio 0.0 as 0.0%', () => {
    render(<AttributionRatio ratio={0.0} />);
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });

  it('renders null ratio as em-dash null state — not blank', () => {
    render(<AttributionRatio ratio={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('null ratio does not render a percentage', () => {
    render(<AttributionRatio ratio={null} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('always renders the "Attribution Ratio" label — never "Coverage" or "Coverage quality"', () => {
    render(<AttributionRatio ratio={0.5} />);
    expect(screen.getByText('Attribution Ratio')).toBeInTheDocument();
    expect(screen.queryByText(/Coverage quality/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Coverage$/i)).not.toBeInTheDocument();
  });

  it('accepts custom label constrained to "Attribution Ratio" literal', () => {
    // TypeScript enforces label?: 'Attribution Ratio' — runtime still shows the label
    render(<AttributionRatio ratio={0.8} label="Attribution Ratio" />);
    expect(screen.getByText('Attribution Ratio')).toBeInTheDocument();
  });
});
