// Reached from /auth/callback after a recovery link. Supabase has already put a
// short-lived recovery session in place by the time this renders, so updateUser
// is all that is needed.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import supabase from '../lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return toast.error('Passwords do not match.');
    if (password.length < 8) return toast.error('Password must be at least 8 characters.');
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password updated. You are signed in.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err?.message || 'That reset link is no longer valid. Request a new one.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-white flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">Choose a new password</h1>
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div>
            <label htmlFor="reset-password" className="form-label">New password</label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="At least 8 characters"
              className="form-input"
            />
          </div>
          <div>
            <label htmlFor="reset-confirm" className="form-label">Confirm new password</label>
            <input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="form-input"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
            {loading ? 'Saving...' : 'Set new password'}
          </button>
        </form>
      </div>
    </div>
  );
}
