import { useState } from 'react';
import DashboardLayout from '../components/shared/DashboardLayout';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function AccountSettingsPage({ noLayout = false }) {
  const { user, logout } = useAuth();
  const [emailForm, setEmailForm] = useState({ new_email: '', password: '' });
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Smart Highlights preference, read from localStorage on mount
  const highlightsKey = user?.id ? `highlights_enabled_${user.id}` : null;
  const stored = highlightsKey ? localStorage.getItem(highlightsKey) : null;
  const [highlightsEnabled, setHighlightsEnabled] = useState(stored !== 'false');

  const handleHighlightsToggle = () => {
    const next = !highlightsEnabled;
    setHighlightsEnabled(next);
    if (highlightsKey) {
      localStorage.setItem(highlightsKey, String(next));
      // If re-enabling, also clear the cooldown so suggestions appear immediately
      if (next && user?.id) {
        localStorage.removeItem(`highlights_dismissed_ts_${user.id}`);
      }
    }
    toast.success(next ? 'Smart Highlights turned on.' : 'Smart Highlights turned off.');
  };

  const handleEmailChange = async (e) => {
    e.preventDefault();
    if (!emailForm.new_email || !emailForm.password) {
      return toast.error('Please fill in all fields.');
    }
    setSavingEmail(true);
    try {
      await api.put('/auth/change-email', emailForm);
      toast.success('Email updated! Please log in again.');
      logout();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      return toast.error('New passwords do not match.');
    }
    if (passwordForm.new_password.length < 8) {
      return toast.error('Password must be at least 8 characters.');
    }
    setSavingPassword(true);
    try {
      await api.put('/auth/change-password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      toast.success('Password changed successfully!');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const inner = (
    <>
      {!noLayout && (
        <>
          <h1 className="page-title mb-2">Account Settings</h1>
          <p className="page-subtitle mb-8">Manage your login credentials.</p>
        </>
      )}

      <div className="max-w-2xl space-y-6">
        <div className="card divide-y divide-line-subtle">
        {/* Current account info */}
        <section className="p-6">
          <h3 className="font-semibold text-ink mb-1">Current account</h3>
          <p className="text-sm text-ink-muted">Logged in as <span className="font-medium text-ink-secondary">{user?.email}</span></p>
          {user?.google_id && <span className="mt-2 inline-flex items-center gap-1 text-xs bg-accent-surface text-accent-text px-2 py-1 rounded-full">Connected with Google</span>}
          {user?.linkedin_id && <span className="mt-2 ml-2 inline-flex items-center gap-1 text-xs bg-accent-surface text-accent-text px-2 py-1 rounded-full">Connected with LinkedIn</span>}
        </section>

        {/* Change email */}
        <section className="p-6">
          <h3 className="font-semibold text-ink mb-1">Change email address</h3>
          <p className="text-sm text-ink-muted mb-5">You'll be logged out after changing your email.</p>
          <form onSubmit={handleEmailChange} className="space-y-4">
            <div>
              <label className="form-label">New email address</label>
              <input type="email" value={emailForm.new_email}
                onChange={e => setEmailForm(f => ({ ...f, new_email: e.target.value }))}
                placeholder="new@email.com" className="form-input" />
            </div>
            <div>
              <label className="form-label">Confirm with your password</label>
              <input type="password" value={emailForm.password}
                onChange={e => setEmailForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••" className="form-input" />
            </div>
            <button type="submit" disabled={savingEmail} className="btn-primary">
              {savingEmail ? 'Updating...' : 'Update email'}
            </button>
          </form>
        </section>

        {/* Change password */}
        <section className="p-6">
          <h3 className="font-semibold text-ink mb-1">Change password</h3>
          <p className="text-sm text-ink-muted mb-5">Must be at least 8 characters.</p>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="form-label">Current password</label>
              <input type="password" value={passwordForm.current_password}
                onChange={e => setPasswordForm(f => ({ ...f, current_password: e.target.value }))}
                placeholder="••••••••" className="form-input" />
            </div>
            <div>
              <label className="form-label">New password</label>
              <input type="password" value={passwordForm.new_password}
                onChange={e => setPasswordForm(f => ({ ...f, new_password: e.target.value }))}
                placeholder="••••••••" className="form-input" />
            </div>
            <div>
              <label className="form-label">Confirm new password</label>
              <input type="password" value={passwordForm.confirm_password}
                onChange={e => setPasswordForm(f => ({ ...f, confirm_password: e.target.value }))}
                placeholder="••••••••" className="form-input" />
            </div>
            <button type="submit" disabled={savingPassword} className="btn-primary">
              {savingPassword ? 'Changing...' : 'Change password'}
            </button>
          </form>
        </section>

        {/* Dashboard preferences */}
        <section className="p-6">
          <h3 className="font-semibold text-ink mb-1">Dashboard preferences</h3>
          <p className="text-sm text-ink-muted mb-5">Control how your dashboard behaves.</p>
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-medium text-ink">Smart Highlights</div>
              <div className="text-xs text-ink-muted mt-0.5">
                Auto-detected suggestions about your projects, shown weekly on your dashboard.
              </div>
            </div>
            <button
              onClick={handleHighlightsToggle}
              role="switch"
              aria-checked={highlightsEnabled}
              aria-label="Smart Highlights"
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ml-6 ${
                highlightsEnabled ? 'bg-accent' : 'bg-surface-muted'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ease-out-quart ${
                highlightsEnabled ? 'translate-x-5' : ''
              }`} />
            </button>
          </div>
          {highlightsEnabled && (
            <p className="text-xs text-ink-faint mt-3">
              Highlights re-appear 7 days after dismissal, or immediately when you re-enable them.
            </p>
          )}
        </section>
        </div>

        {/* Sign out — separated from the settings surface on purpose */}
        <div className="flex items-center justify-between rounded-xl border border-line px-6 py-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Sign out</h3>
            <p className="text-xs text-ink-muted">Sign out of your account on this device.</p>
          </div>
          <button onClick={logout} className="btn-danger">Sign out</button>
        </div>
      </div>
    </>
  );

  return noLayout ? inner : <DashboardLayout>{inner}</DashboardLayout>;
}
