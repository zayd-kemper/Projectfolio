import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApplicationHelperPage from './ApplicationHelperPage';

vi.mock('../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('../utils/jobs', () => ({
  resolveJobResponse: vi.fn(),
}));

vi.mock('../components/shared/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

const PLATFORMS = [
  {
    slug: 'generic', name: 'Generic', description: 'Works anywhere.',
    capabilities: { supportsResume: true, supportsCoverLetter: true, supportsPortfolio: true },
    resume: { acceptedFormats: ['pdf'], maxPages: 2 },
    coverLetter: { maxWords: 400, format: 'plain' },
    tips: ['Attach the PDF resume.'],
  },
  {
    slug: 'greenhouse', name: 'Greenhouse', description: 'Greenhouse ATS pages.',
    capabilities: { supportsResume: true, supportsCoverLetter: true, supportsPortfolio: true },
    resume: { acceptedFormats: ['pdf'], maxPages: 2 },
    coverLetter: { maxWords: 400, format: 'plain' },
    tips: ['Use the Website field.'],
  },
];

describe('ApplicationHelperPage', () => {
  beforeEach(async () => {
    const api = (await import('../utils/api')).default;
    api.get.mockReset();
    api.get.mockImplementation((url) => {
      if (url === '/applications/platforms') return Promise.resolve({ data: { platforms: PLATFORMS } });
      if (url === '/applications') return Promise.resolve({ data: { sessions: [{ id: 's9', platform: 'generic', job_title: 'QA Engineer', company: 'Testify', status: 'ready', created_at: '2026-07-01T00:00:00Z' }] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('renders platform cards and prepared-application history', async () => {
    render(<ApplicationHelperPage />);
    expect(await screen.findByText('Greenhouse')).toBeInTheDocument();
    expect(screen.getByText('Generic')).toBeInTheDocument();
    expect(await screen.findByText('QA Engineer')).toBeInTheDocument();
    expect(screen.getByText('Testify')).toBeInTheDocument();
  });

  it('generates a package and shows the result with copy actions', async () => {
    const api = (await import('../utils/api')).default;
    const { resolveJobResponse } = await import('../utils/jobs');
    api.post.mockResolvedValueOnce({ data: { session_id: 's1', job_id: 'j1', status: 'generating' } });
    resolveJobResponse.mockResolvedValueOnce({
      session_id: 's1',
      package: {
        version: 1,
        platform: { slug: 'greenhouse', name: 'Greenhouse', tips: ['Use the Website field.'], capabilities: {}, resume: { maxPages: 2 }, coverLetter: { maxWords: 400, format: 'plain' } },
        job: { title: 'Design Engineer', company: 'Orbit', analyzed: true, keywords: [], emphasis: [] },
        candidate: { full_name: 'Jane Doe', links: { portfolio: 'https://projectfolio.test/jane' } },
        resume: { pdf_url: '/api/applications/s1/resume', filename: 'jane-greenhouse-resume.pdf', pages: 2, plain_text: 'JANE DOE' },
        cover_letter: { text: 'Dear team at Orbit…', word_count: 4, format: 'plain', source: 'ai' },
        snippets: { skills_summary: 'CAD everywhere', professional_summary: 'ME student', project_summary: 'Liquid Rocket Engine — hot-fired LOX/kerosene engine (CAD, Ansys).', experience_bullets: ['Did a thing'] },
        meta: { session_id: 's1', model_id: 'stub:model', fallback: false },
      },
    });

    render(<ApplicationHelperPage />);
    fireEvent.click(await screen.findByText('Greenhouse'));

    await userEvent.type(screen.getByLabelText('Job title'), 'Design Engineer');
    await userEvent.type(screen.getByLabelText('Company'), 'Orbit');
    fireEvent.click(screen.getByRole('button', { name: 'Generate application package' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/applications', expect.objectContaining({
        platform: 'greenhouse',
        job_title: 'Design Engineer',
        company: 'Orbit',
      }));
    });

    expect(await screen.findByText('Dear team at Orbit…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download resume/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy cover letter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy portfolio URL' })).toBeInTheDocument();
    expect(screen.getByText('Use the Website field.')).toBeInTheDocument();
  });

  it('shows a Project Summary section with the visible portfolio link and project text', async () => {
    const api = (await import('../utils/api')).default;
    const { resolveJobResponse } = await import('../utils/jobs');
    api.post.mockResolvedValueOnce({ data: { session_id: 's1', job_id: 'j1', status: 'generating' } });
    resolveJobResponse.mockResolvedValueOnce({
      session_id: 's1',
      package: {
        version: 1,
        platform: { slug: 'generic', name: 'Generic', tips: [], capabilities: {}, resume: { maxPages: 2 }, coverLetter: { maxWords: 400, format: 'plain' } },
        job: { title: null, company: null, analyzed: false, keywords: [], emphasis: [] },
        candidate: { full_name: 'Jane Doe', links: { portfolio: 'https://projectfolio.test/jane' } },
        resume: { pdf_url: '/api/applications/s1/resume', filename: 'r.pdf', pages: 1, plain_text: 'X' },
        cover_letter: { text: 'Dear team', word_count: 2, format: 'plain', source: 'template' },
        snippets: { skills_summary: '', professional_summary: '', project_summary: 'Rocket — hot-fired engine (CAD).', experience_bullets: [] },
        meta: { session_id: 's1', model_id: null, fallback: true },
      },
    });

    render(<ApplicationHelperPage />);
    fireEvent.click(await screen.findByText('Generic'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate application package' }));

    expect(await screen.findByRole('heading', { name: 'Project Summary' })).toBeInTheDocument();
    expect(screen.getByText('Rocket — hot-fired engine (CAD).')).toBeInTheDocument();
    // The portfolio link is visible text, not hidden behind the copy button.
    expect(screen.getByRole('link', { name: 'https://projectfolio.test/jane' })).toHaveAttribute('href', 'https://projectfolio.test/jane');
  });

  it('downloads the resume through the authenticated API as a blob', async () => {
    const api = (await import('../utils/api')).default;
    const { resolveJobResponse } = await import('../utils/jobs');
    api.post.mockResolvedValueOnce({ data: { session_id: 's1', job_id: 'j1', status: 'generating' } });
    resolveJobResponse.mockResolvedValueOnce({
      session_id: 's1',
      package: {
        version: 1,
        platform: { slug: 'generic', name: 'Generic', tips: [], capabilities: {}, resume: { maxPages: 2 }, coverLetter: { maxWords: 400, format: 'plain' } },
        job: { title: null, company: null, analyzed: false, keywords: [], emphasis: [] },
        candidate: { full_name: 'Jane Doe', links: { portfolio: 'https://projectfolio.test/jane' } },
        resume: { pdf_url: '/api/applications/s1/resume', filename: 'jane-generic-resume.pdf', pages: 1, plain_text: 'JANE DOE' },
        cover_letter: { text: 'Dear team', word_count: 2, format: 'plain', source: 'template' },
        snippets: { skills_summary: '', professional_summary: '', experience_bullets: [] },
        meta: { session_id: 's1', model_id: null, fallback: true },
      },
    });

    render(<ApplicationHelperPage />);
    fireEvent.click(await screen.findByText('Generic'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate application package' }));
    await screen.findByText('Dear team');

    api.get.mockResolvedValueOnce({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) });
    global.URL.createObjectURL = vi.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = vi.fn();
    fireEvent.click(screen.getByRole('button', { name: /Download resume/i }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/applications/s1/resume', { responseType: 'blob' });
    });
  });

  it('auto-fills job title and company from the pasted posting URL', async () => {
    const api = (await import('../utils/api')).default;
    api.post.mockResolvedValueOnce({
      data: { job_title: 'Mechanical Design Engineer', company: 'Orbit Dynamics', source: 'ai' },
    });

    render(<ApplicationHelperPage />);
    fireEvent.click(await screen.findByText('Generic'));

    await userEvent.type(screen.getByLabelText(/Job posting URL/), 'https://jobs.example/123');
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill from posting' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/applications/posting-info', { url: 'https://jobs.example/123' });
    });
    expect(screen.getByLabelText('Job title')).toHaveValue('Mechanical Design Engineer');
    expect(screen.getByLabelText('Company')).toHaveValue('Orbit Dynamics');
  });

  it('keeps /dashboard/applications working as a redirect into the Integrate & Apply tab', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const mainSource = fs.readFileSync(path.resolve(__dirname, '../main.jsx'), 'utf8');
    expect(mainSource).toMatch(/path="\/dashboard\/applications"[^\n]*Navigate to="\/dashboard\/integrations\?tab=applications"/);
    const integrationsSource = fs.readFileSync(path.resolve(__dirname, './IntegrationsPage.jsx'), 'utf8');
    expect(integrationsSource).toMatch(/<ApplicationHelperPage noLayout \/>/);
  });
});
