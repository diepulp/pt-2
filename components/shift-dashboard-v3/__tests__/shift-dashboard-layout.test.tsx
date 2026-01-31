import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  ShiftDashboardLayout,
  useShiftDashboardLayout,
  ShiftDashboardHeader,
  ShiftLeftRail,
  ShiftCenterPanel,
  ShiftRightRail,
} from '../layout';

// Test helper to access layout context
function RailToggleButton() {
  const { isRightRailCollapsed, toggleRightRail } = useShiftDashboardLayout();
  return (
    <button onClick={toggleRightRail} data-testid="toggle">
      {isRightRailCollapsed ? 'collapsed' : 'expanded'}
    </button>
  );
}

describe('ShiftDashboardLayout', () => {
  it('renders children', () => {
    render(
      <ShiftDashboardLayout>
        <div data-testid="child">Hello</div>
      </ShiftDashboardLayout>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('provides layout context with initial expanded state', () => {
    render(
      <ShiftDashboardLayout>
        <RailToggleButton />
      </ShiftDashboardLayout>,
    );
    expect(screen.getByTestId('toggle')).toHaveTextContent('expanded');
  });

  it('toggles right rail collapse state', async () => {
    const user = userEvent.setup();
    render(
      <ShiftDashboardLayout>
        <RailToggleButton />
      </ShiftDashboardLayout>,
    );

    await user.click(screen.getByTestId('toggle'));
    expect(screen.getByTestId('toggle')).toHaveTextContent('collapsed');

    await user.click(screen.getByTestId('toggle'));
    expect(screen.getByTestId('toggle')).toHaveTextContent('expanded');
  });

  it('does not use overflow-hidden on root container', () => {
    const { container } = render(
      <ShiftDashboardLayout>
        <div>Content</div>
      </ShiftDashboardLayout>,
    );
    const root = container.firstElementChild;
    expect(root?.className).not.toContain('overflow-hidden');
  });
});

describe('ShiftDashboardHeader', () => {
  it('renders as sticky header', () => {
    render(
      <ShiftDashboardHeader>
        <span>Header Content</span>
      </ShiftDashboardHeader>,
    );
    const header = screen.getByRole('banner');
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
  });
});

describe('ShiftLeftRail', () => {
  it('renders aside element', () => {
    render(
      <ShiftDashboardLayout>
        <ShiftLeftRail>
          <span>Left Content</span>
        </ShiftLeftRail>
      </ShiftDashboardLayout>,
    );
    const aside = screen.getByText('Left Content').closest('aside');
    expect(aside).toBeInTheDocument();
    expect(aside?.className).toContain('sticky');
  });
});

describe('ShiftCenterPanel', () => {
  it('renders as main element with flex-1', () => {
    render(
      <ShiftCenterPanel>
        <span>Center Content</span>
      </ShiftCenterPanel>,
    );
    const main = screen.getByRole('main');
    expect(main.className).toContain('flex-1');
  });
});

describe('ShiftRightRail', () => {
  it('renders expanded content by default', () => {
    render(
      <ShiftDashboardLayout>
        <ShiftRightRail collapsedContent={<span>Icons</span>}>
          <span>Expanded Content</span>
        </ShiftRightRail>
      </ShiftDashboardLayout>,
    );
    expect(screen.getByText('Expanded Content')).toBeInTheDocument();
    expect(screen.queryByText('Icons')).not.toBeInTheDocument();
  });

  it('shows collapsed content when rail is collapsed', async () => {
    const user = userEvent.setup();
    render(
      <ShiftDashboardLayout>
        <RailToggleButton />
        <ShiftRightRail collapsedContent={<span>Icons</span>}>
          <span>Expanded Content</span>
        </ShiftRightRail>
      </ShiftDashboardLayout>,
    );

    await user.click(screen.getByTestId('toggle'));
    expect(screen.getByText('Icons')).toBeInTheDocument();
    expect(screen.queryByText('Expanded Content')).not.toBeInTheDocument();
  });

  it('applies w-12 class when collapsed', async () => {
    const user = userEvent.setup();
    render(
      <ShiftDashboardLayout>
        <RailToggleButton />
        <ShiftRightRail collapsedContent={<span>Icons</span>}>
          <span>Content</span>
        </ShiftRightRail>
      </ShiftDashboardLayout>,
    );

    const aside = screen.getByText('Content').closest('aside');
    expect(aside?.className).toContain('w-80');
    expect(aside?.className).not.toContain('w-12');

    await user.click(screen.getByTestId('toggle'));
    const collapsedAside = screen.getByText('Icons').closest('aside');
    expect(collapsedAside?.className).toContain('w-12');
  });
});
