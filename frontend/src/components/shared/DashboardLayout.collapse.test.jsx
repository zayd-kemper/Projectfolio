import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardLayout from './DashboardLayout';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { username: 'maya', full_name: 'Maya Iyer' }, signOut: vi.fn() }),
}));

vi.mock('./NotificationBell', () => ({ default: () => null }));

const renderLayout = (children = <div>page body</div>) => render(
  <MemoryRouter>
    <DashboardLayout>{children}</DashboardLayout>
  </MemoryRouter>
);

describe('DashboardLayout sidebar collapse', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('collapses the sidebar from a toggle button and persists the choice', async () => {
    renderLayout();
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(toggle);

    const expandToggle = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(expandToggle).toHaveAttribute('aria-expanded', 'false');
    expect(localStorage.getItem('pf-sidebar-collapsed')).toBe('1');
  });

  it('restores the collapsed state from localStorage on mount', () => {
    localStorage.setItem('pf-sidebar-collapsed', '1');
    renderLayout();
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('shrinks the rail, expands the content area, and exposes a data hook when collapsed', () => {
    localStorage.setItem('pf-sidebar-collapsed', '1');
    const { container } = renderLayout();

    const aside = screen.getByRole('complementary');
    expect(aside.className).toContain('w-[68px]');
    expect(aside.className).not.toContain('w-60');

    const main = screen.getByRole('main');
    expect(main.className).toContain('lg:pl-[68px]');

    const wrapper = container.querySelector('[data-sidebar-collapsed]');
    expect(wrapper).not.toBeNull();
    expect(wrapper.className).toContain('max-w-[84rem]');
  });
});
