import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SeverityFilter } from '../severity-filter';

describe('SeverityFilter', () => {
  const allSeverities = new Set<'critical' | 'warn' | 'info'>([
    'critical',
    'warn',
    'info',
  ]);

  it('renders all three severity buttons', () => {
    const onToggle = jest.fn();
    render(<SeverityFilter selected={allSeverities} onToggle={onToggle} />);

    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('marks selected severities with aria-pressed=true', () => {
    const onToggle = jest.fn();
    const selected = new Set<'critical' | 'warn' | 'info'>(['critical']);

    render(<SeverityFilter selected={selected} onToggle={onToggle} />);

    expect(screen.getByText('Critical').closest('button')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Warning').closest('button')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText('Info').closest('button')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('calls onToggle with severity when clicked', async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();

    render(<SeverityFilter selected={allSeverities} onToggle={onToggle} />);

    await user.click(screen.getByText('Warning').closest('button')!);

    expect(onToggle).toHaveBeenCalledWith('warn');
  });

  it('calls onToggle for each severity independently', async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();

    render(<SeverityFilter selected={allSeverities} onToggle={onToggle} />);

    await user.click(screen.getByText('Critical').closest('button')!);
    await user.click(screen.getByText('Info').closest('button')!);

    expect(onToggle).toHaveBeenCalledWith('critical');
    expect(onToggle).toHaveBeenCalledWith('info');
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
