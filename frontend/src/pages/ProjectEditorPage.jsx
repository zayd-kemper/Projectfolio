// frontend/src/pages/ProjectEditorPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import BlockEditor from '../components/editor/BlockEditor';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import CollaboratorPanel from '../components/editor/CollaboratorPanel';
import TagInput, { TECHNOLOGY_SUGGESTIONS } from '../components/shared/TagInput';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import ConfirmDialog from '../components/shared/ConfirmDialog';
import { EditorSkeleton, MediaGridSkeleton } from '../components/shared/Skeleton';
import { uploadMedia } from '../utils/uploadMedia';

const PROJECT_TYPES = ['Research', 'Engineering Design', 'Software', 'Robotics', 'Simulation / CFD', 'Data Science', 'Hardware', 'Other'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const cleanText = (value) => String(value || '').trim();
const cleanUrl = (value) => cleanText(value) || undefined;
// API DATE fields may arrive as full ISO timestamps; the backend only accepts
// YYYY-MM-DD back, so keep just the date part.
const cleanDate = (value) => {
  const text = cleanText(value);
  if (!text) return undefined;
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
};
const cleanStringArray = (value) => Array.isArray(value)
  ? value.map(item => cleanText(item)).filter(Boolean)
  : [];

export const buildProjectPayload = (project, status) => {
  const payload = {
    title: cleanText(project.title),
    tagline: cleanText(project.tagline),
    description: cleanText(project.description),
    project_type: cleanText(project.project_type),
    technologies: cleanStringArray(project.technologies),
    collaborators: cleanStringArray(project.collaborators),
    cover_image_url: cleanUrl(project.cover_image_url),
    github_url: cleanUrl(project.github_url),
    live_url: cleanUrl(project.live_url),
    start_date: cleanDate(project.start_date),
    end_date: cleanDate(project.end_date),
    status,
    is_featured: project.is_featured === true,
  };

  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
};

const buildBlockSyncPayload = (blocksToSave) => blocksToSave.map((block, index) => ({
  id: UUID_RE.test(String(block.id || '')) ? block.id : null,
  type: block.type,
  content: block.content && typeof block.content === 'object' ? block.content : {},
  sort_order: index,
}));

const mediaIconNameForFileType = (type) => {
  if (!type) return 'attachment';
  if (type.startsWith('image/')) return 'media-frame';
  if (type.startsWith('video/')) return 'video-frame';
  if (type === 'application/pdf') return 'document';
  if (type.includes('word')) return 'document-edit';
  if (type.includes('excel') || type.includes('spreadsheet') || type === 'text/csv') return 'analytics-gauge';
  if (type.includes('powerpoint') || type.includes('presentation')) return 'document';
  if (type.includes('zip') || type.includes('rar') || type.includes('tar') || type.includes('7z')) return 'archive-compress';
  if (type.includes('json') || type.includes('javascript') || type.includes('python') || type.includes('matlab')) return 'code-terminal';
  if (type === 'text/plain') return 'document';
  if (type.includes('acad') || type.includes('dwg') || type.includes('dxf') || type.includes('stl')) return 'measurement';
  return 'attachment';
};

function MediaSidebar({ projectId, onClose }) {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  

  useEffect(() => {
    api.get('/media').then(res => setMedia(res.data.media)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? media
    : filter === 'image' ? media.filter(m => m.file_type?.startsWith('image/'))
    : filter === 'video' ? media.filter(m => m.file_type?.startsWith('video/'))
    : media.filter(m => !m.file_type?.startsWith('image/') && !m.file_type?.startsWith('video/'));

  return (
    <div className="fixed inset-y-0 left-0 z-40 flex w-full max-w-sm flex-col border-r border-line bg-surface shadow-pop lg:left-auto lg:right-0 lg:w-80 lg:border-l lg:border-r-0">
    <div className="flex items-center justify-between px-4 py-3 border-b border-line-subtle">
        <span className="font-semibold text-ink text-sm">Media Library</span>
        <button onClick={onClose} aria-label="Close media library" className="text-ink-muted hover:text-ink-secondary text-sm font-medium leading-none"><EngineeringIcon name="close" size="0.7em" /></button>
      </div>

      <div className="flex gap-1 p-3 border-b border-line-subtle">
        {[
          ['all', 'All', 'open-folder'],
          ['image', 'Image', 'media-frame'],
          ['video', 'Video', 'video-frame'],
          ['document', 'Doc', 'attachment'],
        ].map(([f, label, icon]) => {
          const active = filter === f;
          const tone = active
            ? 'bg-accent text-white'
            : 'bg-surface-muted text-ink-secondary hover:bg-surface-muted';

          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${tone}`}
            >
              <EngineeringIcon name={icon} size="1em" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <MediaGridSkeleton count={6} compact />
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-ink-muted text-sm">
            <EngineeringIcon name="open-folder" size="2.25rem" className="mx-auto mb-2" />
            No {filter !== 'all' ? filter + 's' : 'files'} yet
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map(item => (
              <button type="button" key={item.id} aria-label={`Copy URL for ${item.filename}`}
                className="group relative block w-full rounded-xl overflow-hidden border border-line-subtle bg-surface-muted text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={() => { navigator.clipboard.writeText(item.url); }}>
                <div className="aspect-square flex items-center justify-center overflow-hidden">
                  {item.file_type?.startsWith('image/')
                    ? <img loading="lazy" decoding="async" src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                    : <EngineeringIcon name={mediaIconNameForFileType(item.file_type)} size="2rem" />}
                </div>
                <div className="p-1.5">
                  <div className="text-xs text-ink-muted truncate">{item.filename}</div>
                </div>
                <div className="absolute inset-0 bg-accent/80 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-medium">Copy URL</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-line-subtle text-xs text-ink-muted text-center">
        Click any file to copy its URL
      </div>
    </div>
  );
}

export default function ProjectEditorPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isNew = !id;

  const [project, setProject] = useState({
    title: '',
    tagline: '',
    description: '',
    project_type: '',
    technologies: [],
    collaborators: [],
    start_date: '',
    end_date: '',
    github_url: '',
    live_url: '',
    cover_image_url: '',
    status: 'draft',
    is_featured: false,
  });
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [activeTab, setActiveTab] = useState('content'); // content | settings
  const [coverUploading, setCoverUploading] = useState(false);
  const saveTimeout = useRef(null);
  const saveStatusTimeout = useRef(null);
  const contentVersionRef = useRef(1);
  const [showMediaSidebar, setShowMediaSidebar] = useState(false);
  const statusBadgeTone = project.status === 'published'
    ? 'bg-green-100 text-green-700'
    : 'bg-surface-muted text-ink-secondary';
  const mediaToggleTone = showMediaSidebar
    ? 'bg-accent-surface text-accent-text'
    : 'text-ink-secondary hover:bg-surface-muted hover:text-ink-secondary';
  // Undo / redo snapshots are kept at the block level, up to 50 deep.
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const isUndoing = useRef(false);
  // Unsaved-changes guard. Blocks autosave, but project fields only persist
  // on explicit save — and new projects persist nothing until then.
  const savedSnapshotRef = useRef(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const projectSnapshot = (value) => JSON.stringify(buildProjectPayload(value, value.status));
  const hasUnsavedChanges = () => {
    if (saveStatus === 'saving' || saveStatus === 'error') return true;
    if (isNew) return Boolean(project.title.trim()) || blocks.length > 0;
    if (savedSnapshotRef.current == null) return false;
    return projectSnapshot(project) !== savedSnapshotRef.current;
  };

  // Warn on tab close / refresh / external navigation while dirty.
  useEffect(() => {
    const handler = (event) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  useEffect(() => {
    if (!isNew) fetchProject();
  }, [id]);

  const fetchProject = async () => {
    try {
      const res = await api.get(`/projects/${id}`);
      const fetched = { ...res.data.project, technologies: res.data.project.technologies || [] };
      setProject(fetched);
      savedSnapshotRef.current = projectSnapshot(fetched);
      contentVersionRef.current = Number(res.data.project.content_version || 1);
      setBlocks(res.data.blocks || []);
    } catch {
      toast.error('Project not found.');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  // Undo: push current blocks onto stack before applying change
  const handleBlocksChange = (newBlocks) => {
    if (!isUndoing.current) {
      undoStack.current = [...undoStack.current.slice(-49), blocks];
      redoStack.current = [];
    }
    setBlocks(newBlocks);
    if (!isNew && project.id) {
      clearTimeout(saveTimeout.current);
      setSaveStatus('saving');
      saveTimeout.current = setTimeout(async () => {
        try {
          await autoSaveBlocks(newBlocks, project.id);
          setSaveStatus('saved');
          clearTimeout(saveStatusTimeout.current);
          saveStatusTimeout.current = setTimeout(() => setSaveStatus('idle'), 2500);
        } catch {
          setSaveStatus('error');
        }
      }, 1500);
    }
  };

  const handleUndo = () => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    redoStack.current = [blocks, ...redoStack.current.slice(0, 49)];
    undoStack.current = undoStack.current.slice(0, -1);
    isUndoing.current = true;
    handleBlocksChange(prev);
    setTimeout(() => { isUndoing.current = false; }, 0);
  };

  const handleRedo = () => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current[0];
    undoStack.current = [...undoStack.current.slice(-49), blocks];
    redoStack.current = redoStack.current.slice(1);
    isUndoing.current = true;
    handleBlocksChange(next);
    setTimeout(() => { isUndoing.current = false; }, 0);
  };

  // Global undo/redo keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        // Only intercept if not inside a text input/textarea/tiptap editor
        if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
        e.preventDefault();
        handleRedo();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [blocks]);

  const autoSaveBlocks = async (blocksToSave, projectId) => {
    const response = await api.put(`/projects/${projectId}/blocks/sync`, {
      expected_version: contentVersionRef.current,
      blocks: buildBlockSyncPayload(blocksToSave),
    });
    contentVersionRef.current = response.data.content_version;
    setBlocks(response.data.blocks || []);
    return response.data.blocks || [];
  };

  const handleSave = async (publishAfter = false) => {
    if (!project.title.trim()) {
      toast.error('Please add a project title first.');
      return;
    }

    const isCollaborator = project.user_id !== user?.id;

    setSaving(true);
    try {
      if (!isNew && isCollaborator) {
      // Collaborator: only save blocks
      await autoSaveBlocks(blocks, project.id);
      toast.success('Changes saved!');
      setSaving(false);
      return;
    }
      let projectId = project.id;
      const nextStatus = publishAfter ? 'published' : (isNew ? 'draft' : project.status);
      const payload = buildProjectPayload(project, nextStatus);

      if (isNew) {
        const res = await api.post('/projects', payload);
        projectId = res.data.project.id;
        setProject(res.data.project);
        savedSnapshotRef.current = projectSnapshot(res.data.project);
        contentVersionRef.current = Number(res.data.project.content_version || 1);
        toast.success('Project created!');
      } else {
        await api.put(`/projects/${projectId}`, payload);
        const savedProject = publishAfter ? { ...project, status: 'published' } : project;
        if (publishAfter) setProject(p => ({ ...p, status: 'published' }));
        savedSnapshotRef.current = projectSnapshot(savedProject);
        toast.success('Saved!');
      }

      // Save blocks
      await autoSaveBlocks(blocks, projectId);

      if (isNew) navigate(`/dashboard/projects/${projectId}/edit`, { replace: true });
    } catch (err) {
      const detail = err.response?.data?.details?.[0];
      const message = detail?.message
        ? `${detail.field ? `${detail.field}: ` : ''}${detail.message}`
        : (err.response?.data?.error || 'Save failed.');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleTechChange = (newTechs) => {
    setProject(p => ({ ...p, technologies: newTechs }));
    if (!isNew && project.id) {
      api.put(`/projects/${project.id}`, { technologies: newTechs })
        .then(() => { savedSnapshotRef.current = projectSnapshot({ ...project, technologies: newTechs }); })
        .catch(() => {});
    }
  };

  // Cover image upload
  const { getRootProps: getCoverProps, getInputProps: getCoverInputProps } = useDropzone({
    accept: { 'image/*': [] },
    multiple: false,
    onDrop: async (files) => {
      setCoverUploading(true);
      try {
        const uploaded = await uploadMedia(files[0], { projectId: project.id || null });
        setProject(p => ({ ...p, cover_image_url: uploaded.url }));
        toast.success('Cover image uploaded!');
      } catch { toast.error('Cover upload failed.'); }
      finally { setCoverUploading(false); }
    },
  });

  if (loading) return <EditorSkeleton />;

  return (
    <div className="app-surface min-h-screen bg-surface-page">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-surface border-b border-line-subtle px-6 py-3 flex items-center gap-4">
        <Link
          to="/dashboard"
          onClick={(event) => {
            if (hasUnsavedChanges()) {
              event.preventDefault();
              setConfirmLeave(true);
            }
          }}
          className="text-ink-muted hover:text-ink text-sm"
        >
          Back to dashboard
        </Link>
        <div className="flex-1 min-w-0">
          <input
            value={project.title}
            onChange={e => setProject(p => ({ ...p, title: e.target.value }))}
            placeholder="Project title"
            className="text-xl font-semibold text-ink bg-transparent border-none outline-none w-full"
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Undo / Redo */}
          <button onClick={handleUndo} disabled={undoStack.current.length === 0} title="Undo (Ctrl+Z)"
            className="h-8 px-2 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs font-medium">
            Undo
          </button>
          <button onClick={handleRedo} disabled={redoStack.current.length === 0} title="Redo (Ctrl+Shift+Z)"
            className="h-8 px-2 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs font-medium">
            Redo
          </button>

          <div className="w-px h-5 bg-surface-muted mx-1" />

          {/* Autosave status */}
          <div className="flex items-center gap-1.5 text-xs min-w-[80px]">
            {saveStatus === 'saving' && (
              <><div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-accent-text">Saving...</span></>
            )}
            {saveStatus === 'saved' && (
              <><EngineeringIcon name="signal-success" size="1rem" />
              <span className="text-green-600">Saved</span></>
            )}
            {saveStatus === 'error' && (
              <><span className="text-red-500"><EngineeringIcon name="warning-signal" size="1rem" /></span>
              <span className="text-red-600">Save failed</span></>
            )}
          </div>

          <span className={`badge text-xs ${statusBadgeTone}`}>
            {project.status}
          </span>
          {user && project.slug && project.status === 'published' && (
            <a href={`/${user.username}/${project.slug}`} target="_blank" rel="noreferrer" className="btn-ghost text-sm">Preview</a>
          )}
          <button onClick={() => handleSave(false)} disabled={saving} className="btn-secondary text-sm">
            {saving ? 'Saving...' : 'Save draft'}
          </button>
          {project.status !== 'published' && (
            <button onClick={() => handleSave(true)} disabled={saving} className="btn-primary text-sm">
              Publish
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-surface border-b border-line-subtle px-6 flex gap-6 sticky top-[57px] z-10">
        {[
          ['content', 'Content', 'document-edit'],
          ['settings', 'Settings', 'settings-gear'],
        ].map(([tab, label, icon]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`py-3 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${activeTab === tab ? 'border-accent text-accent-text' : 'border-transparent text-ink-muted hover:text-ink-secondary'}`}>
            <EngineeringIcon name={icon} size="1em" />
            <span>{label}</span>
          </button>
        ))}
      </div>

<div className="px-6 pt-3 bg-surface-page">
  <button onClick={() => setShowMediaSidebar(s => !s)}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mediaToggleTone}`}>
    <EngineeringIcon name="media-frame" size="1em" />
    <span>Media</span>
  </button>
</div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {activeTab === 'content' && (
          <div className="space-y-6">
            {/* Tagline */}
            <input
              value={project.tagline}
              onChange={e => setProject(p => ({ ...p, tagline: e.target.value }))}
              placeholder="One-line description of this project (shows on portfolio)"
              className="w-full text-lg text-ink-muted bg-transparent border-none outline-none border-b border-line-subtle pb-2 focus:border-accent"
            />

            {/* Block editor */}
            <div className="pl-12">
              <BlockEditor blocks={blocks} onBlocksChange={handleBlocksChange} projectId={project.id} />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-8 max-w-2xl">
            {/* Cover Image */}
            <div>
              <label className="form-label">Cover Image</label>
              {project.cover_image_url ? (
                <div className="relative">
                  <img loading="lazy" decoding="async" src={project.cover_image_url} alt="Cover" className="w-full h-48 object-cover rounded-xl" />
                  <button onClick={() => setProject(p => ({ ...p, cover_image_url: '' }))}
                    className="absolute top-2 right-2 bg-black/50 text-white text-xs px-3 py-1 rounded-lg">Remove</button>
                </div>
              ) : (
                <div {...getCoverProps()} className="border-2 border-dashed border-line rounded-xl p-8 text-center cursor-pointer hover:border-ink-faint">
                  <input {...getCoverInputProps()} />
                  {coverUploading ? <div className="text-sm text-ink-muted">Uploading...</div> : (
                    <p className="text-sm text-ink-muted">Drag & drop a cover image or click to upload</p>
                  )}
                </div>
              )}
            </div>

            {/* Project type */}
            <div>
              <label className="form-label">Project type</label>
              <select value={project.project_type} onChange={e => setProject(p => ({ ...p, project_type: e.target.value }))} className="form-input">
                <option value="">Select type</option>
                {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            {/* Technologies */}
            <div>
              <label className="form-label">Technologies & Tools</label>
              <TagInput
                values={project.technologies}
                onChange={handleTechChange}
                suggestions={TECHNOLOGY_SUGGESTIONS}
                placeholder="e.g. SolidWorks, Python, Arduino..."
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label">Start date</label>
                <input type="date" value={project.start_date} onChange={e => setProject(p => ({ ...p, start_date: e.target.value }))} className="form-input" />
              </div>
              <div>
                <label className="form-label">End date</label>
                <input type="date" value={project.end_date} onChange={e => setProject(p => ({ ...p, end_date: e.target.value }))} className="form-input" />
              </div>
            </div>

            {/* Links */}
            <div>
              <label className="form-label">GitHub URL</label>
              <input value={project.github_url} onChange={e => setProject(p => ({ ...p, github_url: e.target.value }))}
                placeholder="https://github.com/you/repo" className="form-input" />
            </div>
            <div>
              <label className="form-label">Live demo / project URL</label>
              <input value={project.live_url} onChange={e => setProject(p => ({ ...p, live_url: e.target.value }))}
                placeholder="https://your-demo.com" className="form-input" />
            </div>

            {/* Description (for SEO/meta) */}
            <div>
              <label className="form-label">Short description (for search engines)</label>
              <textarea value={project.description} onChange={e => setProject(p => ({ ...p, description: e.target.value }))}
                placeholder="2-3 sentences summarizing the project" rows={3} className="form-textarea" />
            </div>

            {/* Featured toggle */}
            <div className="flex items-center gap-3">
              <input type="checkbox" id="featured" checked={project.is_featured}
                onChange={e => setProject(p => ({ ...p, is_featured: e.target.checked }))}
                className="w-4 h-4 text-accent-text rounded" />
              <label htmlFor="featured" className="text-sm text-ink-secondary inline-flex items-center gap-2">
                <EngineeringIcon name="award-badge" size="1rem" />
                Feature this project on my portfolio homepage
              </label>
            </div>

            {/* Collaborators */}
            {project.id && (
              <div className="card p-6">
                <h3 className="font-semibold text-ink mb-1">Collaborators</h3>
                <p className="text-xs text-ink-muted mb-4">
                  Collaborators can edit this project and it appears on their portfolio as a group project.
                </p>
                <CollaboratorPanel
                  projectId={project.id}
                  isOwner={project.user_id === user?.id}
                />
              </div>
            )}

            <button onClick={() => handleSave(false)} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        )}
      </div>

  {showMediaSidebar && (
    <MediaSidebar projectId={project.id} onClose={() => setShowMediaSidebar(false)} />
    )}
      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Leave without saving?"
        description={
          saveStatus === 'error'
            ? 'The last autosave failed, and unsaved edits will be lost if you leave now.'
            : isNew
              ? 'This project has not been created yet — everything here will be lost if you leave now.'
              : 'Your latest edits have not been saved and will be lost if you leave now.'
        }
        confirmLabel="Leave anyway"
        destructive
        onConfirm={() => navigate('/dashboard')}
      />
    </div>
  );
}
