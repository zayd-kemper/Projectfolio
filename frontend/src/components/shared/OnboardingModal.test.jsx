import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OnboardingModal from './OnboardingModal';

vi.mock('../../utils/api', () => ({
  default: { get: vi.fn(), put: vi.fn().mockResolvedValue({}) },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 42 }, updateUser: vi.fn() }),
}));

describe('OnboardingModal', () => {
  it('renders as an accessible modal dialog', () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('dismisses via Escape as a skip', () => {
    const onComplete = vi.fn();
    render(<OnboardingModal onComplete={onComplete} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onComplete).toHaveBeenCalled();
    expect(window.localStorage.getItem('onboarding_done_42')).toBe('1');
  });
});
