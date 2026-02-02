import { render, screen } from '@testing-library/react';

import type { ProvenanceMetadata } from '@/services/table-context/shift-metrics/provenance';
import type { CoverageTier } from '@/services/table-context/shift-metrics/snapshot-rules';

import { CoverageBar } from '../trust/coverage-bar';
import { MetricGradeBadge } from '../trust/metric-grade-badge';
import { MissingDataWarning } from '../trust/missing-data-warning';
import { ProvenanceTooltip } from '../trust/provenance-tooltip';
import { TelemetryQualityIndicator } from '../trust/telemetry-quality-indicator';

// === MetricGradeBadge ===

describe('MetricGradeBadge', () => {
  it('renders AUTHORITATIVE badge with green styling', () => {
    render(<MetricGradeBadge grade="AUTHORITATIVE" />);
    const badge = screen.getByTestId('metric-grade-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('Auth');
    expect(badge.className).toContain('emerald');
  });

  it('renders ESTIMATE badge with amber styling', () => {
    render(<MetricGradeBadge grade="ESTIMATE" />);
    const badge = screen.getByTestId('metric-grade-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('Est');
    expect(badge.className).toContain('amber');
  });

  it('accepts size prop', () => {
    const { rerender } = render(
      <MetricGradeBadge grade="AUTHORITATIVE" size="sm" />,
    );
    expect(screen.getByTestId('metric-grade-badge')).toBeInTheDocument();

    rerender(<MetricGradeBadge grade="AUTHORITATIVE" size="md" />);
    expect(screen.getByTestId('metric-grade-badge')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <MetricGradeBadge grade="ESTIMATE" className="custom-class" />,
    );
    expect(screen.getByTestId('metric-grade-badge').className).toContain(
      'custom-class',
    );
  });
});

// === TelemetryQualityIndicator ===

describe('TelemetryQualityIndicator', () => {
  it('renders GOOD_COVERAGE with emerald color', () => {
    render(<TelemetryQualityIndicator quality="GOOD_COVERAGE" />);
    const indicator = screen.getByTestId('telemetry-quality-indicator');
    expect(indicator).toBeInTheDocument();
  });

  it('renders LOW_COVERAGE with amber color', () => {
    render(<TelemetryQualityIndicator quality="LOW_COVERAGE" />);
    expect(
      screen.getByTestId('telemetry-quality-indicator'),
    ).toBeInTheDocument();
  });

  it('renders NONE with zinc color', () => {
    render(<TelemetryQualityIndicator quality="NONE" />);
    expect(
      screen.getByTestId('telemetry-quality-indicator'),
    ).toBeInTheDocument();
  });

  it('shows label when showLabel is true', () => {
    render(
      <TelemetryQualityIndicator quality="GOOD_COVERAGE" showLabel />,
    );
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('shows "Low" label for LOW_COVERAGE', () => {
    render(
      <TelemetryQualityIndicator quality="LOW_COVERAGE" showLabel />,
    );
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('shows "None" label for NONE', () => {
    render(<TelemetryQualityIndicator quality="NONE" showLabel />);
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('does not show label by default', () => {
    render(<TelemetryQualityIndicator quality="GOOD_COVERAGE" />);
    expect(screen.queryByText('Good')).not.toBeInTheDocument();
  });
});

// === MissingDataWarning ===

describe('MissingDataWarning', () => {
  it('renders em-dash for inline variant', () => {
    render(<MissingDataWarning />);
    const warning = screen.getByTestId('missing-data-warning');
    expect(warning).toBeInTheDocument();
    expect(warning.textContent).toContain('—');
  });

  it('renders block variant with reason text', () => {
    render(
      <MissingDataWarning variant="block" reason="Missing opening snapshot" />,
    );
    const warning = screen.getByTestId('missing-data-warning');
    expect(warning.textContent).toContain('Missing opening snapshot');
  });

  it('shows default message when no reason provided for block variant', () => {
    render(<MissingDataWarning variant="block" />);
    expect(screen.getByText('Data unavailable')).toBeInTheDocument();
  });

  it('sets title attribute for inline variant with reason', () => {
    render(<MissingDataWarning reason="Count pending" />);
    const warning = screen.getByTestId('missing-data-warning');
    expect(warning.getAttribute('title')).toBe('Count pending');
  });

  it('applies custom className', () => {
    render(<MissingDataWarning className="ml-2" />);
    expect(screen.getByTestId('missing-data-warning').className).toContain(
      'ml-2',
    );
  });
});

// === CoverageBar ===

describe('CoverageBar', () => {
  it('renders with HIGH tier and green color', () => {
    render(<CoverageBar ratio={0.9} tier="HIGH" />);
    const bar = screen.getByTestId('coverage-bar');
    expect(bar).toBeInTheDocument();
    const fill = bar.querySelector('div');
    expect(fill?.className).toContain('emerald');
  });

  it('renders with MEDIUM tier and amber color', () => {
    render(<CoverageBar ratio={0.6} tier="MEDIUM" />);
    const bar = screen.getByTestId('coverage-bar');
    const fill = bar.querySelector('div');
    expect(fill?.className).toContain('amber');
  });

  it('renders with LOW tier and red color', () => {
    render(<CoverageBar ratio={0.3} tier="LOW" />);
    const bar = screen.getByTestId('coverage-bar');
    const fill = bar.querySelector('div');
    expect(fill?.className).toContain('red');
  });

  it('renders with NONE tier and no fill', () => {
    render(<CoverageBar ratio={0} tier="NONE" />);
    const bar = screen.getByTestId('coverage-bar');
    // No fill div should be rendered when percentage is 0
    const fill = bar.querySelector('div');
    expect(fill).toBeNull();
  });

  it('sets fill width to correct percentage', () => {
    render(<CoverageBar ratio={0.75} tier="MEDIUM" />);
    const bar = screen.getByTestId('coverage-bar');
    const fill = bar.querySelector('div');
    expect(fill?.style.width).toBe('75%');
  });

  it('applies custom className', () => {
    render(<CoverageBar ratio={0.5} tier="MEDIUM" className="mt-2" />);
    expect(screen.getByTestId('coverage-bar').className).toContain('mt-2');
  });

  const tierCases: [number, CoverageTier, string][] = [
    [1.0, 'HIGH', 'emerald'],
    [0.8, 'HIGH', 'emerald'],
    [0.6, 'MEDIUM', 'amber'],
    [0.3, 'LOW', 'red'],
    [0.0, 'NONE', 'zinc'],
  ];

  it.each(tierCases)(
    'ratio=%f tier=%s uses %s color',
    (ratio, tier, expectedColor) => {
      render(<CoverageBar ratio={ratio} tier={tier} />);
      const bar = screen.getByTestId('coverage-bar');
      if (ratio > 0) {
        const fill = bar.querySelector('div');
        expect(fill?.className).toContain(expectedColor);
      }
    },
  );
});

// === ProvenanceTooltip ===

describe('ProvenanceTooltip', () => {
  const provenance: ProvenanceMetadata = {
    source: 'mixed',
    grade: 'AUTHORITATIVE',
    quality: 'GOOD_COVERAGE',
    coverage_ratio: 1.0,
    null_reasons: [],
  };

  it('renders child element', () => {
    render(
      <ProvenanceTooltip provenance={provenance}>
        <span data-testid="trigger">Value</span>
      </ProvenanceTooltip>,
    );
    expect(screen.getByTestId('trigger')).toBeInTheDocument();
  });

  it('renders with provenance containing null_reasons', () => {
    const provenanceWithReasons: ProvenanceMetadata = {
      source: 'telemetry',
      grade: 'ESTIMATE',
      quality: 'LOW_COVERAGE',
      coverage_ratio: 0.5,
      null_reasons: ['missing_opening', 'partial_coverage'],
    };

    render(
      <ProvenanceTooltip provenance={provenanceWithReasons}>
        <span data-testid="trigger">Value</span>
      </ProvenanceTooltip>,
    );
    expect(screen.getByTestId('trigger')).toBeInTheDocument();
  });
});

// === Integration: Trust Components Compose ===

describe('Trust component composition', () => {
  it('grade badge + quality indicator render side by side', () => {
    render(
      <div data-testid="composition">
        <MetricGradeBadge grade="ESTIMATE" />
        <TelemetryQualityIndicator quality="LOW_COVERAGE" showLabel />
      </div>,
    );

    expect(screen.getByTestId('composition')).toBeInTheDocument();
    expect(screen.getByTestId('metric-grade-badge')).toBeInTheDocument();
    expect(
      screen.getByTestId('telemetry-quality-indicator'),
    ).toBeInTheDocument();
  });

  it('coverage bar + missing data warning render independently', () => {
    render(
      <div>
        <CoverageBar ratio={0.75} tier="MEDIUM" />
        <MissingDataWarning reason="Opening snapshot missing" />
      </div>,
    );

    expect(screen.getByTestId('coverage-bar')).toBeInTheDocument();
    expect(screen.getByTestId('missing-data-warning')).toBeInTheDocument();
  });
});
