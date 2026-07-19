import { useEffect, useState } from 'react';
import DashboardLayout from '../components/shared/DashboardLayout';
import api from '../utils/api';
import { resolveJobResponse } from '../utils/jobs';

const STATUS_STYLES = {
  ready: 'text-emerald-700 dark:text-emerald-400',
  generating: 'text-accent-text',
  failed: 'text-danger',
};

export default function ApplicationHelperPage({ noLayout = false }) {
  const [platforms, setPlatforms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pkg, setPkg] = useState(null);
  // Controlled so "Auto-fill from posting" can populate them programmatically.
  const [details, setDetails] = useState({ job_title: '', company: '', job_posting_url: '' });
  const [autoFilling, setAutoFilling] = useState(false);

  const setDetail = (name) => (event) =>
    setDetails((prev) => ({ ...prev, [name]: event.target.value }));

  const handleAutoFill = async () => {
    const url = details.job_posting_url.trim();
    if (!url || autoFilling) return;
    setAutoFilling(true);
    try {
      const response = await api.post('/applications/posting-info', { url });
      setDetails((prev) => ({
        ...prev,
        job_title: response.data?.job_title || prev.job_title,
        company: response.data?.company || prev.company,
      }));
    } catch {
      // lookup failed — fields stay editable by hand
    } finally {
      setAutoFilling(false);
    }
  };

  const loadSessions = () =>
    api.get('/applications')
      .then((response) => setSessions(response.data?.sessions || []))
      .catch(() => {});

  // The resume endpoint requires the JWT header, so a plain <a href> can't be used —
  // fetch the PDF as a blob and trigger the download client-side.
  const handleDownloadResume = async () => {
    if (!pkg) return;
    try {
      const sessionId = pkg.meta?.session_id;
      const response = await api.get(`/applications/${sessionId}/resume`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = pkg.resume?.filename || 'resume.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      // download failed — the button stays available to retry
    }
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const payload = { platform: selected.slug };
    for (const key of ['job_title', 'company', 'job_posting_url', 'notes']) {
      const value = String(formData.get(key) || '').trim();
      if (value) payload[key] = value;
    }
    const response = await api.post('/applications', payload);
    const result = await resolveJobResponse(response);
    setPkg(result?.package || null);
    loadSessions();
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/applications/platforms').then((response) => {
        if (active) setPlatforms(response.data?.platforms || []);
      }),
      loadSessions(),
    ]).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const inner = (
    <div className="mx-auto max-w-5xl space-y-8">
        {/* Inside the Integrate & Apply tab the surrounding page already provides
            the h1; only the guidance line is repeated there. */}
        <div>
          {!noLayout && <h1 className="page-title">Application Helper</h1>}
          <p className="page-subtitle">
            Pick where you're applying and get a tailored resume, cover letter, and paste-ready snippets built from your portfolio.
          </p>
        </div>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">1. Choose a platform</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {loading && platforms.length === 0 && (
              <div className="skeleton-shimmer h-28 rounded-lg" aria-hidden="true" />
            )}
            {platforms.map((platform) => (
              <button
                key={platform.slug}
                type="button"
                onClick={() => setSelected(platform)}
                className={`card card-interactive p-4 text-left ${selected?.slug === platform.slug ? 'border-accent-border ring-1 ring-accent/30' : ''}`}
                aria-pressed={selected?.slug === platform.slug}
              >
                <p className="font-semibold text-ink">{platform.name}</p>
                <p className="mt-1 text-sm text-ink-muted">{platform.description}</p>
                <p className="mt-2 text-xs text-ink-faint">
                  {platform.capabilities.supportsPortfolio ? 'Portfolio link · ' : ''}
                  Resume ≤{platform.resume.maxPages}p · Letter ≤{platform.coverLetter.maxWords} words
                </p>
              </button>
            ))}
          </div>
        </section>

        {selected && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-ink">2. Job details</h2>
            <form className="card space-y-4 p-5" onSubmit={handleGenerate}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="form-label" htmlFor="app-job-title">Job title</label>
                  <input id="app-job-title" name="job_title" className="form-input" placeholder="e.g. Design Engineer" value={details.job_title} onChange={setDetail('job_title')} />
                </div>
                <div>
                  <label className="form-label" htmlFor="app-company">Company</label>
                  <input id="app-company" name="company" className="form-input" placeholder="e.g. Orbit Dynamics" value={details.company} onChange={setDetail('company')} />
                </div>
              </div>
              <div>
                <label className="form-label" htmlFor="app-posting-url">Job posting URL (optional)</label>
                <div className="flex gap-2">
                  <input id="app-posting-url" name="job_posting_url" className="form-input flex-1" placeholder="https://…" value={details.job_posting_url} onChange={setDetail('job_posting_url')} />
                  <button
                    type="button"
                    className="btn-secondary whitespace-nowrap text-sm"
                    disabled={!details.job_posting_url.trim() || autoFilling}
                    onClick={handleAutoFill}
                  >
                    {autoFilling ? 'Reading posting…' : 'Auto-fill from posting'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-ink-muted">If provided, the posting is analyzed so the letter and resume emphasize what the role asks for.</p>
              </div>
              <div>
                <label className="form-label" htmlFor="app-notes">Notes for the writer (optional)</label>
                <textarea id="app-notes" name="notes" rows={2} className="form-textarea" placeholder="e.g. referred by Sam; emphasize the rocket project" />
              </div>
              <button type="submit" className="btn-primary">
                Generate application package
              </button>
            </form>
          </section>
        )}

        {pkg && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-ink">3. Your application package</h2>
            <div className="card space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-primary text-sm"
                  onClick={handleDownloadResume}
                >
                  Download resume (PDF{pkg.resume?.pages ? `, ${pkg.resume.pages}p` : ''})
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => navigator.clipboard.writeText(pkg.candidate?.links?.portfolio || '').catch(() => {})}
                >
                  Copy portfolio URL
                </button>
              </div>
              <div className="rounded-lg border border-line bg-surface-muted p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">Cover letter</p>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => navigator.clipboard.writeText(pkg.cover_letter?.text || '').catch(() => {})}
                  >
                    Copy cover letter
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ink-secondary">{pkg.cover_letter?.text}</p>
              </div>
              <div className="rounded-lg border border-line bg-surface-muted p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-ink">Project Summary</h3>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => navigator.clipboard.writeText(
                      [pkg.snippets?.project_summary, pkg.candidate?.links?.portfolio].filter(Boolean).join('\n\nPortfolio: ')
                    ).catch(() => {})}
                  >
                    Copy project summary
                  </button>
                </div>
                {pkg.snippets?.project_summary && (
                  <p className="whitespace-pre-wrap text-sm text-ink-secondary">{pkg.snippets.project_summary}</p>
                )}
                {pkg.candidate?.links?.portfolio && (
                  <p className="mt-2 text-sm">
                    <span className="text-ink-muted">Portfolio: </span>
                    <a
                      href={pkg.candidate.links.portfolio}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-accent-text underline-offset-2 hover:underline"
                    >
                      {pkg.candidate.links.portfolio}
                    </a>
                  </p>
                )}
              </div>

              {pkg.platform?.tips?.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium text-ink">Tips for {pkg.platform.name}</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
                    {pkg.platform.tips.map((tip) => <li key={tip}>{tip}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Prepared applications</h2>
          <div className="card divide-y divide-line-subtle">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-ink">{session.job_title || 'Untitled application'}</p>
                  <p className="text-sm text-ink-muted">
                    <span>{session.company || '—'}</span>
                    <span className="text-ink-faint"> · {session.platform}</span>
                  </p>
                </div>
                <span className={`text-xs font-medium ${STATUS_STYLES[session.status] || 'text-ink-muted'}`}>
                  {session.status}
                </span>
              </div>
            ))}
            {!loading && sessions.length === 0 && (
              <p className="p-4 text-sm text-ink-faint">No applications prepared yet.</p>
            )}
          </div>
        </section>
    </div>
  );

  return noLayout ? inner : <DashboardLayout>{inner}</DashboardLayout>;
}
