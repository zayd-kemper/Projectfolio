import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GithubImportModal from './GithubImportModal';

vi.mock('../../utils/api', () => ({
  default: { post: vi.fn() },
}));

vi.mock('../../utils/jobs', () => ({
  resolveJobResponse: vi.fn(),
}));

describe('GithubImportModal', () => {
  beforeEach(async () => {
    const api = (await import('../../utils/api')).default;
    api.post.mockReset();
  });

  it('is wired into DashboardPage in place of the dead integrations link', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../pages/DashboardPage.jsx'), 'utf8');
    expect(src).toMatch(/import GithubImportModal from '\.\.\/components\/shared\/GithubImportModal'/);
    expect(src).toMatch(/<GithubImportModal/);
    // dead "Import from GitHub" link into /dashboard/integrations must be gone
    expect(src).not.toMatch(/to="\/dashboard\/integrations"[^>]*>\s*Import from GitHub/);
  });

  it('DashboardPage toggles the modal open and routes to the new draft on import', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../pages/DashboardPage.jsx'), 'utf8');
    expect(src).toMatch(/const \[showGithubImport, setShowGithubImport\] = useState\(false\)/);
    expect(src).toMatch(/onClick=\{\(\) => setShowGithubImport\(true\)\}/);
    expect(src).toMatch(/navigate\(`\/dashboard\/projects\/\$\{projectId\}\/edit`\)/);
  });

  it('is reachable from the projects toolbar, not only the empty state', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../pages/DashboardPage.jsx'), 'utf8');
    // one opener in the empty state + one persistent toolbar button
    expect((src.match(/setShowGithubImport\(true\)/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/Import from GitHub<\/span>/);
  });

  it('shows a readable error when the repo cannot be imported', async () => {
    const api = (await import('../../utils/api')).default;
    api.post.mockRejectedValueOnce({ response: { data: { error: 'Repository not found. Check the URL and that the repo is public.' } } });
    const onImported = vi.fn();

    render(<GithubImportModal open onClose={() => {}} onImported={onImported} />);
    await userEvent.type(screen.getByLabelText(/GitHub repository URL/i), 'https://github.com/jane/nope');
    fireEvent.click(screen.getByRole('button', { name: /^Import$/ }));

    expect(await screen.findByText(/Repository not found/i)).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('imports a repo and reports the new project id', async () => {
    const api = (await import('../../utils/api')).default;
    const { resolveJobResponse } = await import('../../utils/jobs');
    api.post.mockResolvedValueOnce({ data: { job_id: 'j1', status: 'queued' } });
    resolveJobResponse.mockResolvedValueOnce({ project_id: 'proj-9', block_count: 5 });
    const onImported = vi.fn();

    render(<GithubImportModal open onClose={() => {}} onImported={onImported} />);

    await userEvent.type(screen.getByLabelText(/GitHub repository URL/i), 'https://github.com/jane/proj');
    fireEvent.click(screen.getByRole('button', { name: /^Import$/ }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/import/github', { url: 'https://github.com/jane/proj' });
    });
    await waitFor(() => {
      expect(onImported).toHaveBeenCalledWith('proj-9');
    });
  });
});
