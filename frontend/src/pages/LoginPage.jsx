// frontend/src/pages/LoginPage.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import { GoogleMark, LinkedInMark, GitHubMark } from '../components/shared/BrandMarks';

const PROVIDERS = [
  { id: 'google', label: 'Continue with Google', Mark: GoogleMark,
    className: 'border border-gray-200 text-gray-700 hover:bg-gray-50' },
  { id: 'linkedin_oidc', label: 'Continue with LinkedIn', Mark: LinkedInMark,
    className: 'bg-[#0077B5] text-white hover:bg-[#006399]' },
  { id: 'github', label: 'Continue with GitHub', Mark: GitHubMark,
    className: 'bg-[#24292e] text-white hover:bg-[#1b1f23]' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthPending, setOauthPending] = useState(null);
  const { signInWithPassword, signInWithOAuth } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithPassword(email, password);
      toast.success('Welcome back.');
      navigate('/dashboard');
    } catch (err) {
      // Supabase returns "Email not confirmed" as its own message; surface it as-is
      // so a user who never clicked the confirmation link knows what to do.
      toast.error(err?.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    setOauthPending(provider);
    try {
      // Resolves by navigating away; a rejection means we never left.
      await signInWithOAuth(provider);
    } catch (err) {
      toast.error(err?.message || 'Could not start that sign-in. Please try again.');
      setOauthPending(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-white flex">
      <div className="hidden lg:flex flex-col justify-between w-[28rem] bg-gray-950 p-12 text-white">
        <Link to="/" className="flex items-center gap-2">
          <EngineeringIcon name="brand-projectfolio" size="1.5rem" />
          <span className="font-semibold text-xl text-white">ProjectFolio</span>
        </Link>

        <div>
          <h2 className="text-3xl font-semibold text-white mb-4">Welcome back</h2>
          <p className="text-gray-300 leading-relaxed">
            Pick up your portfolio work, review recent activity, and keep your public proof current.
          </p>
          <div className="mt-8 space-y-4 border-t border-white/10 pt-6">
            {[
              ['analytics-gauge', 'Track portfolio attention without leaving the dashboard.'],
              ['document-edit', 'Review AI edits before anything reaches the public site.'],
              ['source-network', 'Keep one shareable URL ready for applications and reviewers.'],
            ].map(([icon, label]) => (
              <div key={label} className="flex items-start gap-3 text-sm text-gray-300">
                <EngineeringIcon name={icon} size="1.05rem" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-gray-400 text-sm">Evidence-first portfolios for technical work</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <EngineeringIcon name="brand-projectfolio" size="1.25rem" />
            <span className="font-semibold text-gray-900">ProjectFolio</span>
          </div>

          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Sign in</h1>
          <p className="text-gray-600 text-sm mb-6">
            Do not have an account?{' '}
            <Link to="/register" className="text-blue-600 font-medium hover:underline">
              Create one
            </Link>
          </p>

          <div className="space-y-3 mb-6">
            {PROVIDERS.map(({ id, label, Mark, className }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleOAuth(id)}
                disabled={oauthPending === id}
                className={`flex items-center justify-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${className}`}
              >
                <Mark className="w-4 h-4" />
                {oauthPending === id ? 'Redirecting...' : label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-600">or use email</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="form-label">Email address</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@university.edu"
                className="form-input"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="form-label">Password</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                className="form-input"
              />
            </div>
            <p className="text-sm">
              <Link to="/forgot-password" className="text-blue-600 font-medium hover:underline">
                Forgot your password?
              </Link>
            </p>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
