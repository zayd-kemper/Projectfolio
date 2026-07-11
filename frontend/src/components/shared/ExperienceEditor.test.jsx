import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExperienceEditor from './ExperienceEditor';

vi.mock('../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('ExperienceEditor', () => {
  beforeEach(async () => {
    const api = (await import('../../utils/api')).default;
    api.get.mockReset();
  });

  it('renders the three sections and fetched entries', async () => {
    const api = (await import('../../utils/api')).default;
    api.get.mockResolvedValueOnce({
      data: {
        experiences: [
          { id: 'e1', kind: 'employment', title: 'Software Intern', organization: 'Acme Robotics', is_current: true, highlights: [], skills: [] },
          { id: 'e2', kind: 'education', title: 'BSc Mechanical Engineering', organization: 'State University', highlights: [], skills: [] },
        ],
      },
    });

    render(<ExperienceEditor />);

    expect(await screen.findByText('Software Intern')).toBeInTheDocument();
    expect(screen.getByText('BSc Mechanical Engineering')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Employment' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Education' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Certifications' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/profile/experiences');
  });

  it('adds an employment entry through the inline form', async () => {
    const api = (await import('../../utils/api')).default;
    api.get.mockResolvedValueOnce({ data: { experiences: [] } });
    api.post.mockResolvedValueOnce({
      data: { experience: { id: 'new1', kind: 'employment', title: 'Test Engineer', organization: 'Orbit Labs', highlights: [], skills: [] } },
    });

    render(<ExperienceEditor />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add employment' }));

    await userEvent.type(screen.getByLabelText('Title'), 'Test Engineer');
    await userEvent.type(screen.getByLabelText('Organization'), 'Orbit Labs');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/profile/experiences', expect.objectContaining({
        kind: 'employment',
        title: 'Test Engineer',
        organization: 'Orbit Labs',
      }));
    });
    expect(await screen.findByText('Test Engineer')).toBeInTheDocument();
  });

  it('removes an entry after delete is confirmed', async () => {
    const api = (await import('../../utils/api')).default;
    api.get.mockResolvedValueOnce({
      data: { experiences: [{ id: 'e1', kind: 'employment', title: 'Old Role', organization: 'Acme', highlights: [], skills: [] }] },
    });
    api.delete.mockResolvedValueOnce({ data: { success: true } });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);

    render(<ExperienceEditor />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Old Role' }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/profile/experiences/e1');
    });
    expect(screen.queryByText('Old Role')).not.toBeInTheDocument();
  });

  it('edits an entry through the prefilled form and PUTs the update', async () => {
    const api = (await import('../../utils/api')).default;
    api.get.mockResolvedValueOnce({
      data: { experiences: [{ id: 'e1', kind: 'employment', title: 'Old Role', organization: 'Acme', highlights: [], skills: [] }] },
    });
    api.put.mockResolvedValueOnce({
      data: { experience: { id: 'e1', kind: 'employment', title: 'New Role', organization: 'Acme', highlights: [], skills: [] } },
    });

    render(<ExperienceEditor />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Old Role' }));

    const title = screen.getByLabelText('Title');
    expect(title.value).toBe('Old Role');
    await userEvent.clear(title);
    await userEvent.type(title, 'New Role');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/profile/experiences/e1', expect.objectContaining({ title: 'New Role' }));
    });
    expect(await screen.findByText('New Role')).toBeInTheDocument();
  });

  it('is embedded in ProfileSettingsPage', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../pages/ProfileSettingsPage.jsx'),
      'utf8'
    );
    expect(source).toMatch(/import ExperienceEditor from '..\/components\/shared\/ExperienceEditor'/);
    expect(source).toMatch(/<ExperienceEditor \/>/);
  });
});
