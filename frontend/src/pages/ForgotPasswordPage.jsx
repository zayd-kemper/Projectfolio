import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import supabase from '../lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // The link lands on /auth/callback, which establishes the recovery session
      // and then forwards to /reset-password.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err?.message || 'Could not send the reset email.');
      setLoading(false);
      return;
    }
    // Always the same message: whether an address is registered is not public.
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] bg-white flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">Reset your password</h1>
        {sent ? (
          <p className="text-gray-700 text-sm mt-4">
            If an account exists for that address, a reset link is on its way. The link
            expires in one hour.
          </p>
        ) : (
          <>
            <p className="text-gray-600 text-sm mb-6">
              Enter your email and we will send you a link to set a new password.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="form-label">Email address</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@university.edu"
                  className="form-input"
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
          </>
        )}
        <p className="text-sm text-gray-600 mt-6">
          <Link to="/login" className="text-blue-600 font-medium hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
