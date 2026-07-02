// frontend/src/pages/IntegrationsPage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import DashboardLayout from '../components/shared/DashboardLayout';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import api, { API_BASE_URL } from '../utils/api';
import { resolveJobResponse } from '../utils/jobs';
import toast from 'react-hot-toast';

const TABS = [
  { id: 'share', label: 'Share & Export', icon: 'link' },
  { id: 'api', label: 'API & Embed', icon: 'settings-gear' },
];

export default function IntegrationsPage() {
  const { user } = useAuth();
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [apiSpec, setApiSpec] = useState(null);
  const [activeTab, setActiveTab] = useState('share');

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
        <h1 className="page-title">Integrations</h1>
        <p className="page-subtitle">Share your portfolio, export your work, and connect with job platforms.</p>
      </div>

      <div className="mb-8 flex w-fit gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            <EngineeringIcon name={tab.icon} size="1em" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'share' && (
        <div className="max-w-2xl space-y-6">
          <section className="card p-6">
            <h3 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">Your portfolio URL</h3>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Paste this link into any job application, email, or resume.</p>
            <div className="flex gap-2">
              <input readOnly value={portfolioUrl} className="form-input flex-1 font-mono text-sm" />
              <button onClick={handleCopyLink} className="btn-primary whitespace-nowrap">Copy link</button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-500">
              {[
                ['document', 'Applications', 'Paste in additional materials or personal statements'],
                ['briefcase', 'LinkedIn', 'Add to Featured section or contact info'],
                ['mail', 'Email', 'Add to your email signature'],
                ['certificate', 'Resume', 'Place near your name and contact information'],
              ].map(([icon, title, copy]) => (
                <div key={title} className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-800">
                  <EngineeringIcon name={icon} size="1rem" />
                  <span><strong>{title}:</strong> {copy}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-6">
            <h3 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">Export your portfolio</h3>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">Download your portfolio in formats you can attach to applications.</p>
            <div className="space-y-3">
              {[
                ['document', 'PDF / Printable HTML', 'Professional portfolio document for direct attachment', handleExportPDF],
                ['database', 'JSON data export', 'Full portfolio data backup or manual platform integration', handleExportJSON],
              ].map(([icon, title, copy, action]) => (
                <div key={title} className="flex items-center justify-between rounded-xl border border-gray-100 p-4 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800">
                  <div className="flex items-center gap-3">
                    <EngineeringIcon name={icon} size="1.5rem" />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{copy}</div>
                    </div>
                  </div>
                  <button onClick={action} className="btn-secondary text-sm">Download</button>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-6">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">Quick share</h3>
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
            <h3 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">Public Portfolio API</h3>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
              Share these endpoints with any job platform so they can pull your portfolio data directly into their system.
            </p>

            {apiSpec && (
              <div className="space-y-4">
                {apiSpec.endpoints.map((endpoint) => (
                  <div key={endpoint.path} className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="badge bg-green-100 font-mono text-xs text-green-700">{endpoint.method}</span>
                      <code className="text-sm text-gray-800 dark:text-gray-200">{endpoint.path.replace('{username}', user?.username || 'you')}</code>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{endpoint.description}</p>
                    {endpoint.response_example && (
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-300">
                        {JSON.stringify(endpoint.response_example, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-6">
            <h3 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">Embeddable portfolio card</h3>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Send this iframe snippet to render a live preview card of your portfolio.</p>
            <div className="overflow-x-auto rounded-xl bg-gray-900 p-4 font-mono text-sm text-gray-300">{embedCode}</div>
            <button onClick={() => { navigator.clipboard.writeText(embedCode); toast.success('Embed code copied.'); }} className="btn-secondary mt-3 text-sm">
              Copy embed code
            </button>
          </section>

          <section className="card bg-gray-50 p-6 dark:bg-gray-900">
            <h3 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">Full API documentation</h3>
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">Send this URL to developers at platforms that want a full integration.</p>
            <code className="text-sm text-blue-600 dark:text-blue-400">{apiUrl('/integrations/spec')}</code>
            <div className="mt-3">
              <a href={apiUrl('/integrations/spec')} target="_blank" rel="noreferrer" className="btn-ghost text-sm">View API spec</a>
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
