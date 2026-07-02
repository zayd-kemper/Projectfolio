// frontend/src/pages/RegisterPage.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import { API_BASE_URL } from '../utils/api';

const oauthUrl = (provider) => `${API_BASE_URL}/auth/${provider}`;

export default function RegisterPage() {
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      return toast.error('Password must be at least 8 characters.');
    }
    setLoading(true);
    try {
      await register(form);
      toast.success('Account created. Welcome to ProjectFolio.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Registration failed.');
    } finally {
      setLoading(false);
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

        <div className="text-gray-500 text-sm">Evidence-first portfolios for technical work</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <EngineeringIcon name="brand-projectfolio" size="1.25rem" />
            <span className="font-semibold text-gray-900">ProjectFolio</span>
          </div>

          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Create your account</h1>
          <p className="text-gray-500 text-sm mb-6">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>

          <div className="space-y-3 mb-6">
            <a
              href={oauthUrl('google')}
              className="flex items-center justify-center gap-3 w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="" aria-hidden="true" />
              Continue with Google
            </a>
            <a
              href={oauthUrl('linkedin')}
              className="flex items-center justify-center gap-3 w-full px-4 py-2.5 bg-[#0077B5] text-white rounded-lg text-sm font-medium hover:bg-[#006399] transition-colors"
            >
              <span aria-hidden="true" className="font-bold text-base leading-none">in</span>
              Continue with LinkedIn
            </a>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-500">or use email</span>
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
              <p className="mt-1.5 text-xs text-gray-500">Use at least 8 characters.</p>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
              {loading ? 'Creating account...' : 'Create account - free'}
            </button>
          </form>

          <p className="text-xs text-gray-400 mt-6 text-center">
            By signing up you agree to our terms of service.
          </p>
        </div>
      </div>
    </div>
  );
}
