import { useEffect, useState } from 'react';
import api from '../../utils/api';

const SECTIONS = [
  { kind: 'employment', label: 'Employment', addLabel: 'Add employment' },
  { kind: 'education', label: 'Education', addLabel: 'Add education' },
  { kind: 'certification', label: 'Certifications', addLabel: 'Add certification' },
];

const emptyForm = (kind) => ({
  kind,
  title: '',
  organization: '',
  location: '',
  start_date: '',
  end_date: '',
  is_current: false,
  description: '',
});

export default function ExperienceEditor() {
  const [experiences, setExperiences] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.get('/profile/experiences')
      .then((response) => {
        if (active) setExperiences(response.data?.experiences || []);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleDelete = async (entry) => {
    if (!window.confirm(`Delete "${entry.title}"?`)) return;
    try {
      await api.delete(`/profile/experiences/${entry.id}`);
      setExperiences((prev) => prev.filter((item) => item.id !== entry.id));
    } catch {
      // entry stays in the list if the delete fails
    }
  };

  const handleSave = async () => {
    if (!form || saving) return;
    setSaving(true);
    try {
      const { id, ...payload } = form;
      for (const key of ['location', 'start_date', 'end_date', 'description']) {
        if (!payload[key]) delete payload[key];
      }
      const response = id
        ? await api.put(`/profile/experiences/${id}`, payload)
        : await api.post('/profile/experiences', payload);
      const saved = response.data?.experience;
      if (saved) {
        setExperiences((prev) => (
          id ? prev.map((item) => (item.id === id ? saved : item)) : [...prev, saved]
        ));
      }
      setForm(null);
    } catch {
      // keep the form open so nothing typed is lost
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (entry) => {
    setForm({
      id: entry.id,
      kind: entry.kind,
      title: entry.title || '',
      organization: entry.organization || '',
      location: entry.location || '',
      start_date: entry.start_date || '',
      end_date: entry.end_date || '',
      is_current: entry.is_current === true,
      description: entry.description || '',
    });
  };

  return (
    <div className="space-y-6">
      {SECTIONS.map((section) => {
        const entries = experiences.filter((entry) => entry.kind === section.kind);
        return (
          <section key={section.kind} className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-ink">{section.label}</h3>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => setForm(emptyForm(section.kind))}
              >
                {section.addLabel}
              </button>
            </div>

            {form?.kind === section.kind && (
              <div className="mt-4 rounded-lg border border-line bg-surface-muted p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="form-label" htmlFor={`${section.kind}-title`}>Title</label>
                    <input
                      id={`${section.kind}-title`}
                      className="form-input"
                      value={form.title}
                      onChange={(e) => setField('title', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor={`${section.kind}-organization`}>Organization</label>
                    <input
                      id={`${section.kind}-organization`}
                      className="form-input"
                      value={form.organization}
                      onChange={(e) => setField('organization', e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    disabled={saving || !form.title.trim() || !form.organization.trim()}
                    onClick={handleSave}
                  >
                    Save
                  </button>
                  <button type="button" className="btn-ghost text-sm" onClick={() => setForm(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <ul className="mt-3 divide-y divide-line-subtle">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{entry.title}</p>
                    <p className="text-sm text-ink-muted">{entry.organization}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="btn-ghost text-sm"
                      aria-label={`Edit ${entry.title}`}
                      onClick={() => startEdit(entry)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-sm text-danger"
                      aria-label={`Delete ${entry.title}`}
                      onClick={() => handleDelete(entry)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
              {entries.length === 0 && (
                <li className="py-3 text-sm text-ink-faint">Nothing added yet.</li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
