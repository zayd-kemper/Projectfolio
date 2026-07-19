import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NotificationBell from './NotificationBell';

vi.mock('../../utils/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { notifications: [], unread_count: 0 } }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

describe('NotificationBell', () => {
  beforeEach(() => {
    window.localStorage.clear();
    navigate.mockClear();
  });

  it('closes the dropdown when Escape is pressed', () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByTitle('Notifications'));
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument();
  });

  it('exposes notification rows as keyboard-operable buttons that navigate', async () => {
    const api = (await import('../../utils/api')).default;
    api.get.mockResolvedValueOnce({
      data: {
        notifications: [{
          id: 1,
          type: 'project_invite',
          title: 'Invite to Rocket Project',
          message: '',
          is_read: true,
          created_at: new Date().toISOString(),
          data: { invite_token: 'tok123' },
        }],
        unread_count: 0,
      },
    });

    render(<NotificationBell />);
    fireEvent.click(screen.getByTitle('Notifications'));

    const row = await screen.findByRole('button', { name: /^Invite to Rocket Project/ });
    fireEvent.click(row);
    expect(navigate).toHaveBeenCalledWith('/join/tok123');
  });

  it('exposes expanded state on the bell toggle', () => {
    render(<NotificationBell />);
    const toggle = screen.getByTitle('Notifications');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-haspopup', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});
