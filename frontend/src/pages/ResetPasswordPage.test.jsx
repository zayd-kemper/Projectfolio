import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// vi.mock factories hoist above top-level consts, so these must be vi.hoisted().
const { updateUser, navigate } = vi.hoisted(() => ({
  updateUser: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ default: { auth: { updateUser } } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import ResetPasswordPage from './ResetPasswordPage';

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    updateUser.mockReset().mockResolvedValue({ error: null });
    navigate.mockReset();
  });

  it('sets the new password through Supabase and lands on the dashboard', async () => {
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'hunter22' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'hunter22' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });
});
