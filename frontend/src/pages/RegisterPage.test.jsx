import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from './RegisterPage';

const signUp = vi.fn().mockResolvedValue({ needsEmailConfirmation: true });
const signInWithOAuth = vi.fn().mockResolvedValue({});

vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ signUp, signInWithOAuth }) }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

describe('RegisterPage', () => {
  it('signs up through Supabase with the full name as metadata', async () => {
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Maya Iyer' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'maya@uni.edu' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(signUp).toHaveBeenCalledWith({
      email: 'maya@uni.edu', password: 'hunter22', full_name: 'Maya Iyer',
    }));
  });

  it('shows the check-your-email state when confirmation is required', async () => {
    render(<RegisterPage />);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Maya Iyer' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'maya@uni.edu' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });
});
