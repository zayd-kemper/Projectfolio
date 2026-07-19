// frontend/src/pages/IntegrationsPage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import DashboardLayout from '../components/shared/DashboardLayout';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import api, { API_BASE_URL } from '../utils/api';
import ApplicationHelperPage from './ApplicationHelperPage';
import { resolveJobResponse } from '../utils/jobs';
import toast from 'react-hot-toast';

const TABS = [
  { id: 'share', label: 'Share & Export', icon: 'link' },
  { id: 'api', label: 'API & Embed', icon: 'settings-gear' },
  { id: 'applications', label: 'Application Helper', icon: 'briefcase' },
];

// Deep links (/dashboard/integrations?tab=applications) land on the right tab.
const initialTab = () => {
  const requested = new URLSearchParams(window.location.search).get('tab');
  return TABS.some((tab) => tab.id === requested) ? requested : 'share';
};

export default function IntegrationsPage() {
  const { user } = useAuth();
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [apiSpec, setApiSpec] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (user?.username) setPortfolioUrl(`${window.location.origin}/${user.username}`);
    fetchApiSpec();
  }, [user]);

  const fetchApiSpec = async () => {
    try {
      const response = await api.get('/integrations/spec');
      setApiSpec(response.data);
    } catch {}
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(portfolioUrl);
    toast.success('Portfolio URL copied.');
  };

  const handleExportPDF = async () => {
    toast('Generating PDF export...');
    try {
      const response = await api.get(`/export/pdf/${user.username}`);
      const result = await resolveJobResponse(response, { timeoutMs: 5 * 60_000 });
      const link = document.createElement('a');
      link.href = result.url;
      link.download = result.filename;
      link.click();
      toast.success('PDF downloaded.');
    } catch {
      toast.error('PDF generation failed.');
    }
  };

  const handleExportJSON = async () => {
    try {
      const response = await api.get('/export/portfolio/zip', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `projectfolio-export-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Portfolio data exported as JSON.');
    } catch {
      toast.error('Export failed.');
    }
  };

  const apiUrl = (path) => `${API_BASE_URL}${path}`;
  const embedUrl = apiUrl(`/integrations/embed/${user?.username || ''}`);
  const embedCode = `<iframe src="${embedUrl}" width="420" height="160" frameborder="0" style="border-radius:12px;border:1px solid #e5e7eb"></iframe>`;

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="page-title">Integrate & Apply</h1>
        <p className="page-subtitle">Share your portfolio, export your work, and prepare tailored job applications.</p>
      </div>

      <div className="mb-8 flex w-fit gap-1 rounded-xl bg-surface-muted p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink-secondary'}`}
          >
            <EngineeringIcon name={tab.icon} size="1em" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'share' && (
        <div className="max-w-2xl space-y-6">
          <section className="card p-6">
            <h3 className="mb-1 font-semibold text-ink">Your portfolio URL</h3>
            <p className="mb-4 text-sm text-ink-muted">Paste this link into any job application, email, or resume.</p>
            <div className="flex gap-2">
              <input readOnly value={portfolioUrl} className="form-input flex-1 font-mono text-sm" />
              <button onClick={handleCopyLink} className="btn-primary whitespace-nowrap">Copy link</button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-ink-muted sm:grid-cols-2">
              {[
                ['document', 'Applications', 'Paste in additional materials or personal statements'],
                ['briefcase', 'LinkedIn', 'Add to Featured section or contact info'],
                ['mail', 'Email', 'Add to your email signature'],
                ['certificate', 'Resume', 'Place near your name and contact information'],
              ].map(([icon, title, copy]) => (
                <div key={title} className="flex items-start gap-2 rounded-xl bg-surface-muted p-3">
                  <EngineeringIcon name={icon} size="1rem" />
                  <span><strong>{title}:</strong> {copy}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-6">
            <h3 className="mb-1 font-semibold text-ink">Export your portfolio</h3>
            <p className="mb-5 text-sm text-ink-muted">Download your portfolio in formats you can attach to applications.</p>
            <div className="space-y-3">
              {[
                ['document', 'PDF / Printable HTML', 'Professional portfolio document for direct attachment', handleExportPDF],
                ['database', 'JSON data export', 'Full portfolio data backup or manual platform integration', handleExportJSON],
              ].map(([icon, title, copy, action]) => (
                <div key={title} className="flex items-center justify-between rounded-xl border border-line-subtle p-4 transition-colors hover:bg-surface-muted">
                  <div className="flex items-center gap-3">
                    <EngineeringIcon name={icon} size="1.5rem" />
                    <div>
                      <div className="text-sm font-medium text-ink">{title}</div>
                      <div className="text-xs text-ink-muted">{copy}</div>
                    </div>
                  </div>
                  <button onClick={action} className="btn-secondary text-sm">Download</button>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-6">
            <h3 className="mb-4 font-semibold text-ink">Quick share</h3>
            <div className="flex flex-wrap gap-3">
              <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(portfolioUrl)}`} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
                Share on LinkedIn
              </a>
              <a href={`https://twitter.com/intent/tweet?text=Check out my engineering portfolio&url=${encodeURIComponent(portfolioUrl)}`} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
                Share on X / Twitter
              </a>
              <button onClick={() => { navigator.clipboard.writeText(`Check out my project portfolio: ${portfolioUrl}`); toast.success('Copied.'); }} className="btn-secondary text-sm">
                Copy with message
              </button>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'api' && (
        <div className="max-w-3xl space-y-6">
          <section className="card p-6">
            <h3 className="mb-1 font-semibold text-ink">Public Portfolio API</h3>
            <p className="mb-5 text-sm text-ink-muted">
              Share these endpoints with any job platform so they can pull your portfolio data directly into their system.
            </p>

            {apiSpec && (
              <div className="space-y-4">
                {apiSpec.endpoints.map((endpoint) => (
                  <div key={endpoint.path} className="rounded-xl border border-line-subtle p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="badge bg-green-100 font-mono text-xs text-green-700">{endpoint.method}</span>
                      <code className="text-sm text-ink">{endpoint.path.replace('{username}', user?.username || 'you')}</code>
                    </div>
                    <p className="text-xs text-ink-muted">{endpoint.description}</p>
                    {endpoint.response_example && (
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-950 p-3 text-xs text-slate-300">
                        {JSON.stringify(endpoint.response_example, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-6">
            <h3 className="mb-1 font-semibold text-ink">Embeddable portfolio card</h3>
            <p className="mb-4 text-sm text-ink-muted">Send this iframe snippet to render a live preview card of your portfolio.</p>
            <div className="overflow-x-auto rounded-xl bg-gray-950 p-4 font-mono text-sm text-slate-300">{embedCode}</div>
            <button onClick={() => { navigator.clipboard.writeText(embedCode); toast.success('Embed code copied.'); }} className="btn-secondary mt-3 text-sm">
              Copy embed code
            </button>
          </section>

          <section className="card bg-surface-muted p-6">
            <h3 className="mb-2 font-semibold text-ink">Full API documentation</h3>
            <p className="mb-3 text-sm text-ink-muted">Send this URL to developers at platforms that want a full integration.</p>
            <code className="text-sm text-accent-text">{apiUrl('/integrations/spec')}</code>
            <div className="mt-3">
              <a href={apiUrl('/integrations/spec')} target="_blank" rel="noreferrer" className="btn-ghost text-sm">View API spec</a>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'applications' && <ApplicationHelperPage noLayout />}
    </DashboardLayout>
  );
}
