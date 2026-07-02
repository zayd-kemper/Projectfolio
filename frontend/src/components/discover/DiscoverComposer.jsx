import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import EngineeringIcon from '../shared/EngineeringIcon';
import { Avatar } from './DiscoverPrimitives';
import { CONTEXTS, POST_TYPES, cx, typeFor } from './discoverConfig';

const initialState = {
  title: '',
  body: '',
  post_type: 'update',
  context: 'show',
  project_id: '',
  external_url: '',
  looking_for: '',
  visibility: 'public',
  allow_comments: true,
  comment_visibility: 'public',
  media_ids: [],
};

export default function DiscoverComposer({ open, user, initialPost, onClose, onCreated, onUpdated }) {
  const [form, setForm] = useState(initialState);
  const [projects, setProjects] = useState([]);
  const [media, setMedia] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const editing = Boolean(initialPost?.id);
  const selectedType = typeFor(form.post_type);

  useEffect(() => {
    if (!open) return;
    const next = initialPost ? {
      title: initialPost.title || '',
      body: initialPost.body || '',
      post_type: initialPost.post_type || 'update',
      context: initialPost.context || 'show',
      project_id: initialPost.project_id || '',
      external_url: initialPost.external_url || '',
      looking_for: (initialPost.metadata?.looking_for || []).join(', '),
      visibility: initialPost.visibility || 'public',
      allow_comments: initialPost.allow_comments !== false,
      comment_visibility: initialPost.comment_visibility || 'public',
      media_ids: (initialPost.media || []).map((item) => item.id),
    } : initialState;
    setForm(next);
  }, [open, initialPost]);

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    setLoadingAssets(true);
    Promise.all([
      api.get('/discover/my-projects').then((r) => r.data.projects || []).catch(() => []),
      api.get('/media?limit=24').then((r) => r.data.media || []).catch(() => []),
    ]).then(([projectRows, mediaRows]) => {
      if (!alive) return;
      setProjects(projectRows);
      setMedia(mediaRows);
    }).finally(() => alive && setLoadingAssets(false));
    return () => { alive = false; };
  }, [open, user]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === form.project_id),
    [projects, form.project_id]
  );

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  const selectType = (postType) => {
    const fallbackContext = {
      update: 'show',
      feedback_request: 'feedback',
      question: 'ask',
      launch: 'launch',
      resource: 'resource',
      open_to_collab: 'collab',
    }[postType] || 'show';
    update({ post_type: postType, context: fallbackContext });
  };

  const toggleMedia = (id) => {
    setForm((current) => {
      const selected = new Set(current.media_ids);
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < 8) selected.add(id);
      return { ...current, media_ids: [...selected] };
    });
  };

  const payloadFor = (status) => ({
    title: form.title.trim(),
    body: form.body.trim() || null,
    post_type: form.post_type,
    context: form.context,
    project_id: form.project_id || null,
    external_url: form.external_url.trim() || null,
    looking_for: form.looking_for.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8),
    visibility: form.visibility,
    allow_comments: form.allow_comments,
    comment_visibility: form.comment_visibility,
    media_ids: form.media_ids,
    metadata: {},
    status,
  });

  const submit = async (status = 'published') => {
    if (!form.title.trim()) {
      toast.error('Add a concise title first.');
      return;
    }
    if (form.post_type === 'launch' && !form.project_id) {
      toast.error('Launch posts need an attached project.');
      return;
    }
    if (form.post_type === 'resource' && !form.external_url.trim()) {
      toast.error('Resource posts need a link.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = payloadFor(status);
      const response = editing
        ? await api.patch(`/discover/posts/${initialPost.id}`, payload)
        : await api.post('/discover/posts', payload);
      if (status === 'draft') toast.success('Draft saved.');
      else toast.success(editing ? 'Post updated.' : 'Post published.');
      if (response.data.post) {
        if (editing) onUpdated?.(response.data.post);
        else onCreated?.(response.data.post);
      }
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not save the post.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/55 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <section
        className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <Avatar url={user?.avatar_url} name={user?.full_name} size="md" />
            <div>
              <h2 className="text-xl font-semibold text-ink">
                {editing ? 'Edit discover post' : 'Create discover post'}
              </h2>
              <p className="text-sm text-ink-muted">{selectedType.helper}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line p-2 text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
            aria-label="Close composer"
          >
            <EngineeringIcon name="signal-error" size="1rem" />
          </button>
        </header>

        <div className="max-h-[calc(92vh-146px)] overflow-y-auto px-5 py-5">
          <div className="mb-5 grid gap-2 sm:grid-cols-3">
            {POST_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => selectType(type.id)}
                className={cx(
                  'min-h-24 rounded-lg border p-3 text-left transition-colors',
                  form.post_type === type.id
                    ? 'border-accent bg-accent-surface text-accent-text'
                    : 'border-line bg-surface text-ink-secondary hover:border-accent-border'
                )}
              >
                <span className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
                  <EngineeringIcon name={type.icon} size="1.1rem" />
                  {type.label}
                </span>
                <span className="block text-xs leading-relaxed text-ink-muted">{type.helper}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-ink-secondary">Title</span>
                <input
                  value={form.title}
                  onChange={(event) => update({ title: event.target.value.slice(0, 160) })}
                  autoFocus
                  placeholder="What should makers know?"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-ink-secondary">Context</span>
                <textarea
                  value={form.body}
                  onChange={(event) => update({ body: event.target.value.slice(0, 4000) })}
                  rows={6}
                  placeholder="Add the constraints, decisions, results, or specific feedback you want."
                  className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink outline-none transition-colors focus:border-accent"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-secondary">Post context</span>
                  <select
                    value={form.context}
                    onChange={(event) => update({ context: event.target.value })}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent"
                  >
                    {CONTEXTS.map((context) => <option key={context.id} value={context.id}>{context.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-ink-secondary">External link</span>
                  <input
                    value={form.external_url}
                    onChange={(event) => update({ external_url: event.target.value.slice(0, 2048) })}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-ink-secondary">Looking for</span>
                <input
                  value={form.looking_for}
                  onChange={(event) => update({ looking_for: event.target.value.slice(0, 480) })}
                  placeholder="Code review, UX feedback, hardware advice"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent"
                />
              </label>

              <div className="rounded-lg border border-line bg-surface-page p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-ink-secondary">Attach media</span>
                  <Link to="/dashboard/media" className="text-xs font-semibold text-accent-text hover:text-accent-hover">Media library</Link>
                </div>
                {loadingAssets ? (
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map((item) => <div key={item} className="skeleton-shimmer aspect-square rounded-md" />)}
                  </div>
                ) : media.length ? (
                  <div className="grid grid-cols-4 gap-2">
                    {media.slice(0, 12).map((item) => {
                      const selected = form.media_ids.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleMedia(item.id)}
                          className={cx(
                            'relative aspect-square overflow-hidden rounded-md border transition-colors',
                            selected ? 'border-accent ring-2 ring-accent/30' : 'border-line'
                          )}
                          aria-label={`Select ${item.filename || 'media item'}`}
                        >
                          {item.file_type?.startsWith('image/') ? (
                            <img src={item.thumbnail_url || item.url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-surface">
                              <EngineeringIcon name={item.file_type?.startsWith('video/') ? 'video-frame' : 'attachment'} size="1.6rem" />
                            </span>
                          )}
                          {selected ? <span className="absolute right-1 top-1 rounded bg-accent p-1"><EngineeringIcon name="signal-success" size="0.8rem" className="brightness-0 invert" /></span> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted">No media yet. Upload assets in the media library, then attach them here.</p>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-ink-secondary">Project</span>
                <select
                  value={form.project_id}
                  onChange={(event) => update({ project_id: event.target.value })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-accent"
                >
                  <option value="">No project attached</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                </select>
                {selectedProject ? (
                  <div className="mt-2 rounded-lg border border-line bg-surface p-3">
                    <div className="text-sm font-semibold text-ink">{selectedProject.title}</div>
                    <p className="mt-1 line-clamp-3 text-xs text-ink-muted">{selectedProject.tagline || selectedProject.project_type}</p>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-line p-3">
                <span className="mb-2 block text-xs font-semibold text-ink-secondary">Discussion controls</span>
                <label className="flex items-center justify-between gap-3 text-sm font-medium text-ink-secondary">
                  Allow comments
                  <input
                    type="checkbox"
                    checked={form.allow_comments}
                    onChange={(event) => update({ allow_comments: event.target.checked })}
                    className="h-4 w-4 accent-accent"
                  />
                </label>
                <select
                  value={form.comment_visibility}
                  onChange={(event) => update({ comment_visibility: event.target.value })}
                  disabled={!form.allow_comments}
                  className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink outline-none transition-colors disabled:opacity-50"
                >
                  <option value="public">Public comments</option>
                  <option value="followers">Followers only</option>
                  <option value="connections">Connections only</option>
                </select>
              </div>

              <div className="rounded-lg border border-line p-3">
                <span className="mb-2 block text-xs font-semibold text-ink-secondary">Visibility</span>
                <select
                  value={form.visibility}
                  onChange={(event) => update({ visibility: event.target.value })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink outline-none transition-colors"
                >
                  <option value="public">Public feed</option>
                  <option value="followers">Followers only</option>
                </select>
              </div>
            </aside>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-2">Cancel</button>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => submit('draft')}
              disabled={submitting}
              className="btn-secondary px-4 py-2"
            >
              <EngineeringIcon name="document" size="1rem" />
              Save draft
            </button>
            <button
              type="button"
              onClick={() => submit('published')}
              disabled={submitting || !form.title.trim()}
              className="btn-primary px-5 py-2"
            >
              <EngineeringIcon name={editing ? 'signal-success' : 'launch-vector'} size="1rem" className="brightness-0 invert" />
              {submitting ? 'Saving...' : editing ? 'Update post' : 'Publish'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
