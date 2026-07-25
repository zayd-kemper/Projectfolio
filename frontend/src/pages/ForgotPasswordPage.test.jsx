import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// vi.mock factories are hoisted above top-level const declarations, so the mock
// fns have to be declared with vi.hoisted() or the factory sees them uninitialised.
const { resetPasswordForEmail } = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn() }));

vi.mock('../lib/supabase', () => ({ default: { auth: { resetPasswordForEmail } } }));
vi.mock('react-router-dom', () => ({ Link: ({ to, children }) => <a href={to}>{children}</a> }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import ForgotPasswordPage from './ForgotPasswordPage';

describe('ForgotPasswordPage', () => {
  beforeEach(() => resetPasswordForEmail.mockReset().mockResolvedValue({ error: null }));

  it('sends a recovery email pointed at the auth callback', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'a@b.com',
      { redirectTo: `${window.location.origin}/auth/callback` },
    ));
  });

  it('confirms without revealing whether the account exists', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'nobody@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/if an account exists/i)).toBeInTheDocument();
  });
});
