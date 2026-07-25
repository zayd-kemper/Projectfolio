// frontend/src/pages/RegisterPage.jsx
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

export default function RegisterPage() {
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [oauthPending, setOauthPending] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  const { signUp, signInWithOAuth } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      return toast.error('Password must be at least 8 characters.');
    }
    setLoading(true);
    try {
      const result = await signUp(form);
      if (result.needsEmailConfirmation) {
        setSentTo(form.email);
      } else {
        toast.success('Account created. Welcome to ProjectFolio.');
        navigate('/dashboard');
      }
    } catch (err) {
      toast.error(err?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    setOauthPending(provider);
    try {
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
          <h2 className="text-3xl font-semibold text-white mb-4">Start showcasing your work</h2>
          <p className="text-gray-400 leading-relaxed">
            Build a portfolio around evidence: projects, media, decisions, collaborators, and measurable outcomes.
          </p>
          <div className="mt-8 space-y-4 border-t border-white/10 pt-6">
            {[
              ['blocks', 'Structure case studies without rebuilding a site from scratch.'],
              ['ai-core', 'Use the Site Agent as an editing option, with review before apply.'],
              ['source-network', 'Publish once, then share the same proof across applications.'],
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

          {sentTo && (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h2 className="text-base font-semibold text-gray-900">Check your email</h2>
              <p className="mt-1 text-sm text-gray-700">
                We sent a confirmation link to <span className="font-medium">{sentTo}</span>.
                Click it to finish setting up your account, then sign in.
              </p>
            </div>
          )}

          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Create your account</h1>
          <p className="text-gray-600 text-sm mb-6">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 font-medium hover:underline">
              Sign in
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
              <label htmlFor="register-full-name" className="form-label">Full name</label>
              <input
                id="register-full-name"
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                required
                placeholder="Maya Iyer"
                className="form-input"
              />
            </div>
            <div>
              <label htmlFor="register-email" className="form-label">Email address</label>
              <input
                id="register-email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="you@university.edu"
                className="form-input"
              />
            </div>
            <div>
              <label htmlFor="register-password" className="form-label">Password</label>
              <input
                id="register-password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                required
                placeholder="At least 8 characters"
                className="form-input"
              />
              <p className="mt-1.5 text-xs text-gray-600">Use at least 8 characters.</p>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
              {loading ? 'Creating account...' : 'Create account - free'}
            </button>
          </form>

          <p className="text-xs text-gray-600 mt-6 text-center">
            By signing up you agree to our terms of service.
          </p>
        </div>
      </div>
    </div>
  );
}
