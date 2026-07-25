import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccountSettingsPage from './AccountSettingsPage';

// vi.mock factories are hoisted above every other top-level statement (including
// plain `const x = vi.fn()`), so referencing such a const directly inside a
// factory throws "Cannot access 'x' before initialization". vi.hoisted() runs
// alongside that hoisting instead of after it, which avoids the TDZ.
const { updateUser, signInWithPassword, signOut } = vi.hoisted(() => ({
  updateUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  default: { auth: { updateUser, signInWithPassword } },
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'old@b.com' }, signOut }),
}));
vi.mock('../components/shared/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

describe('AccountSettingsPage', () => {
  beforeEach(() => {
    updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
    signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  });

  it('requests an email change through Supabase', async () => {
    render(<AccountSettingsPage />);
    fireEvent.change(screen.getByLabelText(/new email/i), { target: { value: 'new@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send confirmation/i }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ email: 'new@b.com' }));
  });

  it('reauthenticates before changing the password', async () => {
    render(<AccountSettingsPage />);
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'new-pass-1' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'new-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'old@b.com', password: 'old-pass',
    }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'new-pass-1' }));
  });

  it('does not change the password when the current one is wrong', async () => {
    signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } });
    render(<AccountSettingsPage />);
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'new-pass-1' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'new-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalled());
    expect(updateUser).not.toHaveBeenCalled();
  });
});
