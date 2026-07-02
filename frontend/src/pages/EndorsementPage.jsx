// frontend/src/pages/EndorsementPage.jsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import api from '../utils/api';

export default function EndorsementPage() {
  const { token } = useParams();
  const [status, setStatus] = useState('loading');
  const [context, setContext] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [form, setForm] = useState({ from_name: '', from_role: '', quote: '' });
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get(`/endorsements/lookup/${token}`);
        setContext(response.data);
        setStatus('form');
      } catch (err) {
        setErrorMsg(err.response?.data?.error || 'This endorsement link is invalid or has already been used.');
        setStatus('error');
      }
    })();
  }, [token]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (name === 'quote') setCharCount(value.length);
  };

  const handleSubmit = async () => {
    if (!form.from_name.trim() || !form.quote.trim()) return;
    setStatus('submitting');
    try {
      await api.post(`/endorsements/submit/${token}`, form);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to submit. Please try again.');
      setStatus('form');
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
        <div className="card max-w-md p-10 text-center">
          <EngineeringIcon name="clock" size="3rem" className="mx-auto mb-4" />
          <h2 className="mb-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">Link unavailable</h2>
          <p className="mb-6 text-gray-500 dark:text-gray-400">{errorMsg}</p>
          <Link to="/" className="btn-primary">Go to ProjectFolio</Link>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
        <div className="card max-w-md p-10 text-center">
          <EngineeringIcon name="signal-success" size="3rem" className="mx-auto mb-4" />
          <h2 className="mb-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">Endorsement submitted</h2>
          <p className="mb-6 text-gray-500 dark:text-gray-400">
            Thank you. {context?.recipient?.full_name} will review your endorsement before adding it to their portfolio.
          </p>
          <Link to={`/${context?.recipient?.username || ''}`} className="btn-primary">View their portfolio</Link>
        </div>
      </div>
    );
  }

  const { recipient, project_title } = context;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-950">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          {recipient.avatar_url ? (
            <img
              src={recipient.avatar_url}
              alt={recipient.full_name}
              className="mx-auto mb-4 h-16 w-16 rounded-full border-2 border-white object-cover shadow-md dark:border-gray-700"
            />
          ) : (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-2xl dark:bg-blue-900">
              {recipient.full_name?.[0] || '?'}
            </div>
          )}
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Endorse {recipient.full_name}</h1>
          {recipient.headline && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{recipient.headline}</p>}
          {project_title && <p className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400">Re: {project_title}</p>}
        </div>

        <div className="card space-y-5 p-8">
          {errorMsg && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="form-label">Your name <span className="text-red-500">*</span></label>
            <input name="from_name" value={form.from_name} onChange={handleChange} placeholder="Maya Iyer" className="form-input" />
          </div>

          <div>
            <label className="form-label">Your role / company <span className="font-normal text-gray-400">(optional)</span></label>
            <input name="from_role" value={form.from_role} onChange={handleChange} placeholder="e.g. Senior Controls Engineer, robotics lab mentor" className="form-input" />
          </div>

          <div>
            <label className="form-label">Endorsement <span className="text-red-500">*</span></label>
            <textarea
              name="quote"
              value={form.quote}
              onChange={handleChange}
              rows={5}
              maxLength={1000}
              placeholder={`Share your experience working with ${recipient.full_name}. What made them stand out?`}
              className="form-input resize-none"
            />
            <p className={`mt-1 text-right text-xs ${charCount > 900 ? 'text-amber-500' : 'text-gray-400'}`}>{charCount} / 1000</p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!form.from_name.trim() || !form.quote.trim() || status === 'submitting'}
            className="btn-primary w-full"
          >
            {status === 'submitting' ? 'Submitting...' : 'Submit endorsement'}
          </button>

          <p className="text-center text-xs text-gray-400">
            Your endorsement will be reviewed by {recipient.full_name} before appearing on their portfolio.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Powered by <Link to="/" className="text-gray-500 hover:underline">ProjectFolio</Link>
        </p>
      </div>
    </div>
  );
}
