import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdvisorPage from './AdvisorPage';

vi.mock('../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('../utils/jobs', () => ({
  resolveJobResponse: vi.fn(),
}));

vi.mock('../components/shared/DashboardLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

const SESSIONS = [
  { id: 's1', status: 'ready', goals: { objective: 'projects', growth: 'vertical' }, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:10:00Z' },
  { id: 's2', status: 'failed', goals: { objective: 'skills', growth: 'horizontal' }, error: 'model down', created_at: '2026-07-02T00:00:00Z', updated_at: '2026-07-02T00:05:00Z' },
];

describe('AdvisorPage', () => {
  beforeEach(async () => {
    const api = (await import('../utils/api')).default;
    api.get.mockReset();
    api.post.mockReset();
    api.patch.mockReset();
    api.delete.mockReset();
    api.get.mockImplementation((url) => {
      if (url === '/advisor/sessions') return Promise.resolve({ data: { sessions: SESSIONS } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('renders saved roadmap history with statuses and a new-roadmap call to action', async () => {
    render(<AdvisorPage />);
    expect(await screen.findByRole('button', { name: /New roadmap/i })).toBeInTheDocument();
    expect(await screen.findByText('Build standout projects')).toBeInTheDocument();
    expect(screen.getByText('Develop new skills')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('walks the goals wizard, generates, and renders the analysis, suggestions, and roadmap', async () => {
    const api = (await import('../utils/api')).default;
    const { resolveJobResponse } = await import('../utils/jobs');

    const PACKAGE = {
      version: 1,
      goals: { objective: 'projects', growth: 'vertical', focus_note: 'aerial autonomy' },
      analysis: {
        discipline: 'robotics',
        discipline_label: 'Robotics & Autonomous Systems',
        confidence: 'high',
        current_level: 'intermediate',
        summary: 'Ada, your rover work gives you a real robotics foundation.',
        strengths: ['ROS navigation experience'],
        skill_gaps: ['SLAM at production scale'],
        interests: ['Aerial autonomy'],
        direction: 'Aim at autonomy-stack internships.',
        source: 'ai',
      },
      suggestions: {
        projects: [
          {
            title: 'Autonomous mapping robot', description: 'Build a mobile robot that maps a room.',
            why_recommended: 'Curated pick: matches your primary discipline.', technologies: ['ROS 2', 'Lidar'],
            difficulty: 'intermediate', estimated_weeks: 8, builds_on: [], source: 'curated', catalog_id: 'ro-slam-robot',
          },
          {
            title: 'Drone precision-landing controller', description: 'Vision-based landing.',
            why_recommended: 'Extends your control work.', technologies: ['PX4', 'OpenCV'],
            difficulty: 'advanced', estimated_weeks: 6, builds_on: ['Quadcopter Path Planner'], source: 'ai',
          },
        ],
        skills: [
          { name: 'Motion planning', why: 'Bridges SLAM to behavior.', resources: [{ name: 'OMPL primer', type: 'docs', provider: 'OMPL', url: 'https://ompl.kavrakilab.org/primer.html' }], source: 'ai' },
        ],
      },
      roadmap: {
        narrative: 'Two quarters from mapping to aerial autonomy.',
        steps: [
          { id: 'step-1', title: 'Ship the mapping robot', description: 'Finish and publish.', kind: 'project', estimated_weeks: 8, outcome: 'Published SLAM project' },
          { id: 'step-2', title: 'Study motion planning', description: 'Work through OMPL.', kind: 'skill', estimated_weeks: 3, outcome: 'Planning fluency' },
        ],
      },
      meta: { session_id: 's3', model_id: 'stub:model', curated_count: 1, fallback: false, fallback_reason: null },
    };

    api.post.mockResolvedValueOnce({ data: { session_id: 's3', job_id: 'j1', status: 'generating' } });
    resolveJobResponse.mockResolvedValueOnce({ session_id: 's3', package: PACKAGE });
    api.get.mockImplementation((url) => {
      if (url === '/advisor/sessions') return Promise.resolve({ data: { sessions: SESSIONS } });
      if (url === '/advisor/sessions/s3') {
        return Promise.resolve({ data: { session: { id: 's3', status: 'ready', goals: PACKAGE.goals, package: PACKAGE, progress: {} } } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(<AdvisorPage />);
    fireEvent.click(await screen.findByRole('button', { name: /New roadmap/i }));

    fireEvent.click(await screen.findByRole('button', { name: /Build standout projects/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(await screen.findByRole('button', { name: /Advance to the next level/ }));
    await userEvent.type(screen.getByLabelText(/Focus/i), 'aerial autonomy');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(await screen.findByRole('button', { name: /Build my roadmap/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/advisor/sessions', expect.objectContaining({
        objective: 'projects',
        growth: 'vertical',
        focus_note: 'aerial autonomy',
      }));
    });

    expect(await screen.findByText('Robotics & Autonomous Systems')).toBeInTheDocument();
    expect(screen.getByText(/rover work gives you a real robotics foundation/)).toBeInTheDocument();
    expect(screen.getByText('Drone precision-landing controller')).toBeInTheDocument();
    expect(screen.getByText(/Curated pick/)).toBeInTheDocument();
    expect(screen.getByText(/Ship the mapping robot/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /OMPL primer/ })).toHaveAttribute('href', 'https://ompl.kavrakilab.org/primer.html');
  });

  it('checks off a roadmap step via PATCH and updates the progress meter', async () => {
    const api = (await import('../utils/api')).default;

    const PACKAGE = {
      version: 1,
      analysis: { discipline_label: 'Robotics & Autonomous Systems', current_level: 'intermediate', confidence: 'high', summary: 's', strengths: [], skill_gaps: [], source: 'ai' },
      suggestions: { projects: [], skills: [] },
      roadmap: {
        narrative: 'n',
        steps: [
          { id: 'step-1', title: 'Ship the mapping robot', kind: 'project' },
          { id: 'step-2', title: 'Study motion planning', kind: 'skill' },
        ],
      },
      meta: { session_id: 's1', fallback: false },
    };
    api.get.mockImplementation((url) => {
      if (url === '/advisor/sessions') return Promise.resolve({ data: { sessions: SESSIONS } });
      if (url === '/advisor/sessions/s1') {
        return Promise.resolve({ data: { session: { id: 's1', status: 'ready', goals: {}, package: PACKAGE, progress: {} } } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    api.patch.mockResolvedValueOnce({
      data: { progress: { 'step-1': { completed: true, completed_at: '2026-07-17T00:00:00Z' } } },
    });

    render(<AdvisorPage />);
    fireEvent.click(await screen.findByText('Build standout projects'));

    const checkbox = (await screen.findAllByRole('checkbox'))[0];
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText('0 of 2 steps done')).toBeInTheDocument();

    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/advisor/sessions/s1/steps/step-1', { completed: true });
    });
    expect(await screen.findByText('1 of 2 steps done')).toBeInTheDocument();
    expect((await screen.findAllByRole('checkbox'))[0]).toBeChecked();
    expect(screen.getByRole('progressbar', { name: 'Roadmap progress' })).toHaveAttribute('aria-valuenow', '50');
  });

  it('is registered as a protected route and a dashboard nav item', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const mainSource = fs.readFileSync(path.resolve(__dirname, '../main.jsx'), 'utf8');
    expect(mainSource).toMatch(/path="\/dashboard\/advisor"[^\n]*AdvisorPage/);
    const layoutSource = fs.readFileSync(path.resolve(__dirname, '../components/shared/DashboardLayout.jsx'), 'utf8');
    expect(layoutSource).toMatch(/to: '\/dashboard\/advisor',\s*label: 'Advisor'/);
  });
});
