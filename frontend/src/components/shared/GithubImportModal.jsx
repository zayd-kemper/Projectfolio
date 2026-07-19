import { useState } from 'react';
import api from '../../utils/api';
import { resolveJobResponse } from '../../utils/jobs';

// Paste a public GitHub repo URL → enqueue a github-import job → poll to completion
// → hand the new draft project id back so the caller can open it in the editor.
// Rendered inside the dashboard's .app-surface shell, so token classes theme correctly.
export default function GithubImportModal({ open, onClose, onImported }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleImport = async (event) => {
    event.preventDefault();
    if (busy || !url.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.post('/import/github', { url: url.trim() });
      const result = await resolveJobResponse(response);
      if (result?.project_id) {
        onImported(result.project_id);
      } else {
        setError('Import finished but no project was created. Try again.');
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Import failed. Check the URL and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} aria-hidden="true" />
      <div className="app-surface relative w-full max-w-md rounded-xl bg-surface p-6 text-ink shadow-pop" role="dialog" aria-modal="true" aria-label="Import project from GitHub">
        <h2 className="text-lg font-semibold text-ink">Import from GitHub</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Paste a public repository URL. We&apos;ll pull the title, tags, links, and README into a draft project you can edit.
        </p>

        <form onSubmit={handleImport} className="mt-4 space-y-3">
          <div>
            <label className="form-label" htmlFor="gh-import-url">GitHub repository URL</label>
            <input
              id="gh-import-url"
              className="form-input"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
              disabled={busy}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !url.trim()}>
              {busy ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
