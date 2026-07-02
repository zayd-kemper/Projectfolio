// frontend/src/components/editor/BlockEditor.jsx
// Advanced block editor: drag-to-reorder, slash commands, rich toolbar, and block types.

import { useState, useRef, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import EngineeringIcon, { iconNameForEmoji } from '../shared/EngineeringIcon';
import { uploadMedia } from '../../utils/uploadMedia';
import FilePreview, { canPreviewFile, normalizePreviewUrl } from '../shared/FilePreview';

export const BLOCK_TYPES = [
  { type: 'text',      icon: 'document',        label: 'Text',            desc: 'Rich paragraph with formatting',       group: 'Basic' },
  { type: 'heading',   icon: 'document-edit',   label: 'Heading',         desc: 'Section title (H1 / H2 / H3)',         group: 'Basic' },
  { type: 'divider',   icon: 'measurement',     label: 'Divider',         desc: 'Horizontal separator',                 group: 'Basic' },
  { type: 'callout',   icon: 'idea-spark',      label: 'Callout',         desc: 'Highlighted note or insight',          group: 'Basic' },
  { type: 'image',     icon: 'media-frame',     label: 'Image',           desc: 'Upload or link a photo',               group: 'Media' },
  { type: 'gallery',   icon: 'gallery-grid',    label: 'Image Gallery',   desc: 'Multiple images in a grid',            group: 'Media' },
  { type: 'video',     icon: 'video-frame',     label: 'Video',           desc: 'YouTube, Vimeo, or uploaded video',    group: 'Media' },
  { type: 'file',      icon: 'attachment',      label: 'File Attachment', desc: 'PDF, CAD, STL, or any document',       group: 'Media' },
  { type: 'embed',     icon: 'link',            label: 'Embed',           desc: 'Figma, Sketchfab, Google Slides...',   group: 'Media' },
  { type: 'code',      icon: 'code-terminal',   label: 'Code Block',      desc: 'Syntax-highlighted code snippet',      group: 'Technical' },
  { type: 'metrics',   icon: 'analytics-gauge', label: 'Metrics / Stats', desc: 'Showcase numbers and results',         group: 'Technical' },
  { type: 'table',     icon: 'database',        label: 'Table',           desc: 'Structured comparison or data table',  group: 'Technical' },
  { type: 'timeline',  icon: 'calendar',        label: 'Timeline',        desc: 'Project milestones and phases',        group: 'Technical' },
];

const BLOCK_GROUPS = ['Basic', 'Media', 'Technical'];

const DEFAULT_CONTENT = {
  text:     { html: '' },
  heading:  { text: '', level: 2 },
  image:    { url: '', caption: '', alt: '' },
  gallery:  { images: [] },
  video:    { url: '', caption: '' },
  code:     { code: '', language: 'python' },
  callout:  { icon: '', text: '', color: 'amber' },
  file:     { url: '', filename: '', size: 0 },
  embed:    { url: '', height: 400 },
  divider:  {},
  metrics:  { items: [{ label: 'Result', value: '', unit: '' }] },
  table:    { headers: ['Column 1', 'Column 2', 'Column 3'], rows: [['', '', ''], ['', '', '']] },
  timeline: { items: [{ date: '', title: '', description: '' }] },
};

// ── SLASH COMMAND MENU ────────────────────────────────────────────────────────
function SlashMenu({ position, query, onSelect, onClose }) {
  const [selected, setSelected] = useState(0);
  const filtered = BLOCK_TYPES.filter(b =>
    b.label.toLowerCase().includes(query.toLowerCase()) ||
    b.desc.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter')     { e.preventDefault(); if (filtered[selected]) onSelect(filtered[selected].type); }
      if (e.key === 'Escape')    onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [filtered, selected, onSelect, onClose]);

  if (filtered.length === 0) return null;

  const groups = BLOCK_GROUPS.map(g => ({
    name: g,
    items: filtered.filter(b => b.group === g),
  })).filter(g => g.items.length > 0);

  let globalIndex = 0;

  return (
    <div
      className="fixed z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl w-72 overflow-hidden"
      style={{ top: position.y + 8, left: position.x }}
    >
      <div className="px-3 pt-2.5 pb-1">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Add block</span>
      </div>
      <div className="max-h-72 overflow-y-auto pb-2">
        {groups.map(group => (
          <div key={group.name}>
            <div className="px-3 py-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400">{group.name}</div>
            {group.items.map(item => {
              const idx = globalIndex++;
              return (
                <button
                  key={item.type}
                  onMouseDown={(e) => { e.preventDefault(); onSelect(item.type); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${idx === selected ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  <span className="w-7 h-7 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg flex-shrink-0">
                    <EngineeringIcon name={item.icon} size="1rem" />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.label}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">{item.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FLOATING TOOLBAR ──────────────────────────────────────────────────────────
function FloatingToolbar({ editor }) {
  const [pos, setPos] = useState(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { from, to } = editor.state.selection;
      if (from === to) { setPos(null); return; }
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0) { setPos(null); return; }
      setPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
    };
    editor.on('selectionUpdate', update);
    return () => { editor.off('selectionUpdate', update); };
  }, [editor]);

  useEffect(() => {
    const hide = () => setPos(null);
    document.addEventListener('selectionchange', () => {
      if (!window.getSelection()?.toString()) hide();
    });
  }, []);

  if (!pos || !editor) return null;

  const applyLink = () => {
    if (linkUrl) editor.chain().focus().setLink({ href: linkUrl }).run();
    else editor.chain().focus().unsetLink().run();
    setLinkMode(false);
    setLinkUrl('');
  };

  const tools = [
    { label: 'B',  title: 'Bold',          action: () => editor.chain().focus().toggleBold().run(),              active: editor.isActive('bold'),             style: 'font-bold' },
    { label: 'I',  title: 'Italic',        action: () => editor.chain().focus().toggleItalic().run(),            active: editor.isActive('italic'),           style: 'italic' },
    { label: 'U',  title: 'Underline',     action: () => editor.chain().focus().toggleUnderline().run(),         active: editor.isActive('underline'),        style: 'underline' },
    { label: 'S',  title: 'Strikethrough', action: () => editor.chain().focus().toggleStrike().run(),            active: editor.isActive('strike'),           style: 'line-through' },
    { sep: true },
    { label: 'H1', title: 'Heading 1',     action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive('heading', { level: 1 }) },
    { label: 'H2', title: 'Heading 2',     action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }) },
    { sep: true },
    { label: '•',  title: 'Bullet list',   action: () => editor.chain().focus().toggleBulletList().run(),        active: editor.isActive('bulletList') },
    { label: '1.', title: 'Ordered list',  action: () => editor.chain().focus().toggleOrderedList().run(),       active: editor.isActive('orderedList') },
    { label: '"',  title: 'Blockquote',    action: () => editor.chain().focus().toggleBlockquote().run(),        active: editor.isActive('blockquote') },
    { label: '<>', title: 'Inline code',   action: () => editor.chain().focus().toggleCode().run(),              active: editor.isActive('code') },
  ];

  return (
    <div
      className="fixed z-50 bg-gray-900 rounded-xl shadow-2xl px-1.5 py-1 flex items-center gap-0.5 -translate-x-1/2 -translate-y-full pointer-events-auto"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={e => e.preventDefault()}
    >
      {tools.map((t, i) => t.sep
        ? <div key={i} className="w-px h-4 bg-gray-700 mx-1" />
        : (
          <button key={t.label} title={t.title} onClick={t.action}
            className={`px-2 py-1 rounded-lg text-xs font-mono transition-colors ${t.active ? 'bg-blue-600 text-white' : 'text-white/75 hover:bg-gray-700 hover:text-white'} ${t.style || ''}`}>
            {t.label}
          </button>
        )
      )}
      <div className="w-px h-4 bg-gray-700 mx-1" />
      {linkMode ? (
        <div className="flex items-center gap-1">
          <input autoFocus value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyLink(); if (e.key === 'Escape') setLinkMode(false); }}
            placeholder="https://..."
            className="bg-gray-800 text-white text-xs rounded-lg px-2 py-1 w-40 outline-none border border-gray-600 focus:border-blue-500" />
          <button onClick={applyLink} className="text-blue-400 text-xs px-1 hover:text-blue-300">Apply</button>
          <button onClick={() => setLinkMode(false)} className="text-gray-500 text-xs px-1">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setLinkMode(true)} title="Link"
          className={`px-2 py-1 rounded-lg text-xs transition-colors ${editor.isActive('link') ? 'bg-blue-600 text-white' : 'text-white/75 hover:bg-gray-700 hover:text-white'}`}>
          <EngineeringIcon name="link" size="1rem" />
        </button>
      )}
    </div>
  );
}

// ── TEXT BLOCK ────────────────────────────────────────────────────────────────
function TextBlock({ block, onUpdate, onAddBlock, blockIndex }) {
  const [slashMenu, setSlashMenu] = useState(null);
  const [slashQuery, setSlashQuery] = useState('');
  const slashStart = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Type '/' for commands, or start writing..." }),
    ],
    content: block.content?.html || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const { from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(Math.max(0, from - 60), from, '\n');
      const slashIdx = textBefore.lastIndexOf('/');

      if (slashIdx !== -1 && (slashIdx === 0 || /[\s\n]/.test(textBefore[slashIdx - 1]))) {
        const query = textBefore.slice(slashIdx + 1);
        setSlashQuery(query);
        if (!slashMenu) {
          const coords = editor.view.coordsAtPos(from);
          setSlashMenu({ x: coords.left, y: coords.bottom });
          slashStart.current = from - query.length - 1;
        }
      } else {
        setSlashMenu(null);
        slashStart.current = null;
      }

      onUpdate(block.id, { html });
    },
  });

  const handleSlashSelect = (type) => {
    if (editor && slashStart.current !== null) {
      const { from } = editor.state.selection;
      editor.chain().focus().deleteRange({ from: slashStart.current, to: from }).run();
    }
    setSlashMenu(null);
    slashStart.current = null;
    onAddBlock(type, blockIndex);
  };

  return (
    <div className="relative">
      <FloatingToolbar editor={editor} />
      <EditorContent editor={editor} className="tiptap min-h-[60px]" />
      {slashMenu && (
        <SlashMenu
          position={slashMenu}
          query={slashQuery}
          onSelect={handleSlashSelect}
          onClose={() => { setSlashMenu(null); slashStart.current = null; }}
        />
      )}
    </div>
  );
}

// ── HEADING BLOCK ─────────────────────────────────────────────────────────────
function HeadingBlock({ block, onUpdate }) {
  const sizes = { 1: 'text-3xl', 2: 'text-2xl', 3: 'text-xl' };
  return (
    <div>
      <div className="flex gap-1 mb-2">
        {[1, 2, 3].map(l => {
          const active = block.content?.level === l;
          const tone = active
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600';

          return (
            <button
              key={l}
              onClick={() => onUpdate(block.id, { ...block.content, level: l })}
              className={`px-2.5 py-1 text-xs rounded-lg border font-mono transition-colors ${tone}`}
            >
              H{l}
            </button>
          );
        })}
      </div>
      <input
        value={block.content?.text || ''}
        onChange={e => onUpdate(block.id, { ...block.content, text: e.target.value })}
        placeholder={`Heading ${block.content?.level || 2}`}
        className={`w-full bg-transparent border-none outline-none font-semibold ${sizes[block.content?.level || 2]} text-gray-900 placeholder-gray-200`}
      />
    </div>
  );
}

// ── IMAGE BLOCK ───────────────────────────────────────────────────────────────
function ImageBlock({ block, onUpdate, projectId }) {
  const [uploading, setUploading] = useState(false);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': [] },
    multiple: false,
    onDrop: async (files) => {
      if (!files[0]) return;
      setUploading(true);
      try {
        const uploaded = await uploadMedia(files[0], { projectId });
        onUpdate(block.id, { ...block.content, url: uploaded.url });
        toast.success('Image uploaded!');
      } catch { toast.error('Upload failed.'); }
      finally { setUploading(false); }
    },
  });

  if (block.content?.url) {
    return (
      <div>
        <div className="relative group">
          <img src={block.content.url} alt={block.content.alt || ''} className="w-full rounded-xl max-h-[500px] object-cover" />
          <button onClick={() => onUpdate(block.id, { ...block.content, url: '' })}
            className="absolute top-2 right-2 bg-black/60 text-white text-xs px-3 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
            Replace
          </button>
        </div>
        <div className="flex gap-4 mt-2">
          <input value={block.content.alt || ''} onChange={e => onUpdate(block.id, { ...block.content, alt: e.target.value })}
            placeholder="Alt text (accessibility)" className="flex-1 text-xs text-gray-400 bg-transparent border-none outline-none border-b border-gray-100 pb-1 focus:border-gray-300 transition-colors" />
          <input value={block.content.caption || ''} onChange={e => onUpdate(block.id, { ...block.content, caption: e.target.value })}
            placeholder="Caption (optional)" className="flex-1 text-xs text-gray-400 bg-transparent border-none outline-none border-b border-gray-100 pb-1 focus:border-gray-300 italic transition-colors" />
        </div>
      </div>
    );
  }

  return (
    <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${isDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.01]' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/30 dark:hover:bg-blue-900/10'}`}>
      <input {...getInputProps()} />
      {uploading ? (
        <div className="flex items-center justify-center gap-2">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Uploading...</span>
        </div>
      ) : (
        <>
          <EngineeringIcon name="media-frame" size="2rem" className="mx-auto mb-2" />
          <p className="text-sm text-gray-500 mb-1">Drag & drop or click to upload</p>
          <p className="text-xs text-gray-400">PNG, JPG, WebP, GIF up to 10MB</p>
          <div className="mt-3 text-xs text-gray-400">Or paste a URL below.</div>
          <input onClick={e => e.stopPropagation()} placeholder="https://..." value={block.content?.url || ''}
            onChange={e => onUpdate(block.id, { ...block.content, url: e.target.value })}
            className="mt-2 w-full max-w-sm mx-auto px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 bg-transparent dark:text-gray-300 rounded-lg outline-none focus:border-blue-400 dark:focus:border-blue-600 transition-colors" />
        </>
      )}
    </div>
  );
}

// ── IMAGE GALLERY BLOCK ───────────────────────────────────────────────────────
function GalleryBlock({ block, onUpdate, projectId }) {
  const [uploading, setUploading] = useState(false);
  const images = block.content?.images || [];

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': [] },
    multiple: true,
    onDrop: async (files) => {
      setUploading(true);
      const uploaded = [];
      for (const file of files) {
        try {
          const result = await uploadMedia(file, { projectId });
          uploaded.push({ url: result.url, caption: '' });
        } catch { toast.error(`Failed: ${file.name}`); }
      }
      onUpdate(block.id, { images: [...images, ...uploaded] });
      if (uploaded.length) toast.success(`${uploaded.length} image${uploaded.length > 1 ? 's' : ''} uploaded!`);
      setUploading(false);
    },
  });

  const removeImage = (idx) => onUpdate(block.id, { images: images.filter((_, i) => i !== idx) });
  const updateCaption = (idx, caption) => onUpdate(block.id, { images: images.map((img, i) => i === idx ? { ...img, caption } : img) });

  const gridCols = images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div>
      {images.length > 0 && (
        <div className={`grid gap-2 mb-3 ${gridCols}`}>
          {images.map((img, i) => (
            <div key={i} className="group relative rounded-xl overflow-hidden bg-gray-100">
              <img src={img.url} alt="" className="w-full h-40 object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors" />
              <button onClick={() => removeImage(i)}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center font-bold">x</button>
              <input value={img.caption || ''} onChange={e => updateCaption(i, e.target.value)}
                placeholder="Caption..."
                className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1.5 placeholder-white/50 border-none outline-none opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      )}
      <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${isDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/20 dark:hover:bg-blue-900/10'}`}>
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> Uploading...
          </div>
        ) : (
          <div className="text-center">
            <EngineeringIcon name="gallery-grid" size="2rem" className="mx-auto mb-2" />
            <p className="text-sm text-gray-400">{images.length > 0 ? 'Drop more images to add to gallery' : 'Drop images here or click to upload (select multiple)'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── VIDEO BLOCK ───────────────────────────────────────────────────────────────
function VideoBlock({ block, onUpdate }) {
  const getEmbed = (url) => {
    if (!url) return null;
    const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]+)/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    const vm = url.match(/vimeo\.com\/(\d+)/);
    if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
    return null;
  };
  const embed = getEmbed(block.content?.url);
  return (
    <div>
      <input value={block.content?.url || ''} onChange={e => onUpdate(block.id, { ...block.content, url: e.target.value })}
        placeholder="YouTube or Vimeo URL, or direct video link" className="form-input mb-3 text-sm" />
      {embed ? (
        <div className="relative pb-[56.25%] h-0 rounded-xl overflow-hidden bg-gray-900">
          <iframe src={embed} className="absolute inset-0 w-full h-full" frameBorder="0" allowFullScreen title="video" />
        </div>
      ) : block.content?.url ? (
        <video src={block.content.url} controls className="w-full rounded-xl" />
      ) : null}
      {block.content?.url && (
        <input value={block.content.caption || ''} onChange={e => onUpdate(block.id, { ...block.content, caption: e.target.value })}
          placeholder="Caption (optional)" className="w-full text-xs text-gray-400 bg-transparent border-none outline-none mt-2 text-center italic" />
      )}
    </div>
  );
}

// ── CODE BLOCK ────────────────────────────────────────────────────────────────
const LANGUAGES = ['python', 'javascript', 'typescript', 'cpp', 'c', 'java', 'matlab', 'bash', 'sql', 'json', 'yaml', 'arduino', 'rust', 'go', 'r', 'julia', 'latex', 'html', 'css'];

function CodeBlock({ block, onUpdate }) {
  const code = block.content?.code || '';
  const lines = code.split('\n').length;
  return (
    <div className="bg-gray-950 rounded-xl overflow-hidden border border-gray-800">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 bg-gray-900/80">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        </div>
        <select value={block.content?.language || 'python'}
          onChange={e => onUpdate(block.id, { ...block.content, language: e.target.value })}
          className="bg-gray-800 text-gray-400 text-xs border border-gray-700 rounded-md px-2 py-0.5 font-mono outline-none ml-2">
          {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button onClick={() => { navigator.clipboard.writeText(code); toast.success('Copied!'); }}
          className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors font-mono px-2 py-0.5 rounded hover:bg-gray-800">
          copy
        </button>
      </div>
      <div className="flex">
        <div className="select-none border-r border-gray-800 bg-gray-900/40 px-3 py-4 min-w-[2.5rem] text-right">
          {Array.from({ length: Math.max(lines, 1) }, (_, i) => (
            <div key={i} className="text-gray-600 text-xs font-mono leading-6">{i + 1}</div>
          ))}
        </div>
        <textarea value={code} onChange={e => onUpdate(block.id, { ...block.content, code: e.target.value })}
          placeholder="// your code here"
          className="flex-1 bg-transparent text-green-300 font-mono text-sm p-4 border-none outline-none resize-none leading-6"
          rows={Math.max(4, lines + 1)} spellCheck={false} />
      </div>
    </div>
  );
}

// ── CALLOUT BLOCK ─────────────────────────────────────────────────────────────
const CALLOUT_STYLES = {
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-900',  badge: 'bg-amber-100 text-amber-700',  label: 'Note',     icon: 'idea-spark' },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-900',    badge: 'bg-red-100 text-red-700',      label: 'Warning',  icon: 'warning-signal' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-900',  badge: 'bg-green-100 text-green-700',  label: 'Result',   icon: 'signal-success' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-900',   badge: 'bg-blue-100 text-blue-700',    label: 'Research', icon: 'research-scope' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', badge: 'bg-purple-100 text-purple-700',label: 'Insight',  icon: 'launch-vector' },
};
const CALLOUT_ICONS = [
  { name: 'idea-spark', label: 'Idea' },
  { name: 'warning-signal', label: 'Warning' },
  { name: 'research-scope', label: 'Research' },
  { name: 'document-edit', label: 'Note' },
  { name: 'signal-success', label: 'Result' },
  { name: 'signal-error', label: 'Issue' },
  { name: 'launch-vector', label: 'Launch' },
  { name: 'tool-wrench', label: 'Tooling' },
  { name: 'analytics-gauge', label: 'Data' },
  { name: 'target', label: 'Goal' },
  { name: 'key-access', label: 'Access' },
  { name: 'message', label: 'Discussion' },
  { name: 'lab-vessel', label: 'Lab' },
  { name: 'award-badge', label: 'Achievement' },
  { name: 'pin', label: 'Pinned' },
];

function CalloutBlock({ block, onUpdate }) {
  const [showPicker, setShowPicker] = useState(false);
  const color = block.content?.color || 'amber';
  const style = CALLOUT_STYLES[color] || CALLOUT_STYLES.amber;
  const selectedIcon = block.content?.icon || iconNameForEmoji(block.content?.emoji) || style.icon;
  return (
    <div className={`${style.bg} border ${style.border} rounded-xl p-4`}>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {Object.entries(CALLOUT_STYLES).map(([key, s]) => (
          <button key={key} onClick={() => onUpdate(block.id, { ...block.content, color: key })}
            className={`text-xs px-2.5 py-0.5 rounded-full font-medium transition-all ${color === key ? s.badge + ' ring-1 ring-current/30' : 'bg-white/60 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 border border-transparent hover:border-gray-200 dark:hover:border-gray-600'}`}>
            <span className="inline-flex items-center gap-1.5">
              <EngineeringIcon name={s.icon} size="0.9rem" />
              {s.label}
            </span>
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowPicker(s => !s)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent hover:border-gray-200 hover:bg-white/70 dark:hover:border-gray-700 dark:hover:bg-gray-900/60 transition-colors"
            aria-label="Choose callout icon"
            type="button"
          >
            <EngineeringIcon name={selectedIcon} size="1.35rem" />
          </button>
          {showPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-2 shadow-xl z-20 grid grid-cols-5 gap-1 w-52">
              {CALLOUT_ICONS.map(icon => (
                <button
                  key={icon.name}
                  onClick={() => { onUpdate(block.id, { ...block.content, icon: icon.name, emoji: '' }); setShowPicker(false); }}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${selectedIcon === icon.name ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  title={icon.label}
                  aria-label={icon.label}
                  type="button"
                >
                  <EngineeringIcon name={icon.name} size="1rem" />
                </button>
              ))}
            </div>
          )}
        </div>
        <textarea value={block.content?.text || ''} onChange={e => onUpdate(block.id, { ...block.content, text: e.target.value })}
          placeholder="Add a key insight, result, or warning..."
          className={`flex-1 bg-transparent border-none outline-none ${style.text} text-sm resize-none min-h-[40px]`} rows={2} />
      </div>
    </div>
  );
}

// ── FILE BLOCK ────────────────────────────────────────────────────────────────
function getFileIcon(type = '') {
  if (type.startsWith('image/')) return 'media-frame';
  if (type.startsWith('video/')) return 'video-frame';
  if (type.startsWith('audio/')) return 'audio-wave';
  if (type === 'application/pdf') return 'document';
  if (type.includes('zip') || type.includes('rar')) return 'archive-compress';
  if (type.includes('dwg') || type.includes('dxf') || type.includes('stl') || type.includes('step')) return 'measurement';
  if (type.includes('word') || type.includes('document')) return 'document-edit';
  if (type.includes('excel') || type.includes('spreadsheet') || type === 'text/csv') return 'analytics-gauge';
  return 'attachment';
}

function FileBlock({ block, onUpdate, projectId }) {
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    onDrop: async (files) => {
      if (!files[0]) return;
      setUploading(true);
      try {
        const uploaded = await uploadMedia(files[0], { projectId });
        onUpdate(block.id, { url: uploaded.url, filename: files[0].name, size: files[0].size, type: files[0].type });
        setPreviewOpen(false);
        toast.success('File uploaded!');
      } catch { toast.error('Upload failed.'); }
      finally { setUploading(false); }
    },
  });

  if (block.content?.url) {
    const sizeMB = block.content.size ? (block.content.size / (1024 * 1024)).toFixed(2) : null;
    const previewable = canPreviewFile(block.content);
    const safeUrl = normalizePreviewUrl(block.content.url);
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group">
          <EngineeringIcon name={getFileIcon(block.content.type)} size="1.75rem" className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-200 truncate">{block.content.filename}</div>
            <div className="text-xs text-gray-400">
              {sizeMB ? sizeMB + ' MB' : 'Attachment'}{!previewable ? ' - download required' : ''}
            </div>
          </div>
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => setPreviewOpen(open => !open)}
              className="btn-secondary text-xs !px-3 !py-1.5"
              aria-expanded={previewOpen}
            >
              {previewOpen ? 'Hide preview' : 'Preview'}
            </button>
            <button type="button" onClick={() => { setPreviewOpen(false); onUpdate(block.id, {}); }} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Replace</button>
            {safeUrl && <a href={safeUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs !px-3 !py-1.5">Download</a>}
          </div>
        </div>
        {previewOpen && <FilePreview file={block.content} />}
      </div>
    );
  }

  return (
    <div {...getRootProps()} className={'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ' + (isDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/20 dark:hover:bg-blue-900/10')}>
      <input {...getInputProps()} />
      {uploading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> Uploading...
        </div>
      ) : (
        <>
          <EngineeringIcon name="attachment" size="2rem" className="mx-auto mb-2" />
          <p className="text-sm text-gray-500">Drag & drop any file - PDF, CAD (.DWG, .STEP, .STL), code, data, etc.</p>
        </>
      )}
    </div>
  );
}

// ── EMBED BLOCK ───────────────────────────────────────────────────────────────
function EmbedBlock({ block, onUpdate }) {
  const [height, setHeight] = useState(block.content?.height || 400);
  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input value={block.content?.url || ''} onChange={e => onUpdate(block.id, { ...block.content, url: e.target.value })}
          placeholder="Paste embed URL (Figma, Sketchfab, Google Slides, CodePen...)" className="form-input flex-1 text-sm" />
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-gray-400">Height:</span>
          <input type="number" value={height} min={200} max={900} step={50}
            onChange={e => { const h = +e.target.value; setHeight(h); onUpdate(block.id, { ...block.content, height: h }); }}
            className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400" />
          <span className="text-xs text-gray-400">px</span>
        </div>
      </div>
      {block.content?.url && (
        <iframe src={block.content.url} className="w-full rounded-xl border border-gray-200" style={{ height }} title="embed" />
      )}
    </div>
  );
}

// ── METRICS BLOCK ─────────────────────────────────────────────────────────────
const METRIC_COLORS = [
  { bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-100'   },
  { bg: 'bg-green-50',  text: 'text-green-600',   border: 'border-green-100'  },
  { bg: 'bg-purple-50', text: 'text-purple-600',  border: 'border-purple-100' },
  { bg: 'bg-orange-50', text: 'text-orange-600',  border: 'border-orange-100' },
  { bg: 'bg-pink-50',   text: 'text-pink-600',    border: 'border-pink-100'   },
  { bg: 'bg-teal-50',   text: 'text-teal-600',    border: 'border-teal-100'   },
];

function MetricsBlock({ block, onUpdate }) {
  const items = block.content?.items || [{ label: '', value: '', unit: '' }];
  const update = (i, field, val) => onUpdate(block.id, { items: items.map((item, idx) => idx === i ? { ...item, [field]: val } : item) });
  const addItem = () => onUpdate(block.id, { items: [...items, { label: '', value: '', unit: '' }] });
  const removeItem = (i) => onUpdate(block.id, { items: items.filter((_, idx) => idx !== i) });

  const gridCols = items.length <= 2 ? 'grid-cols-2' : items.length <= 3 ? 'grid-cols-3' : items.length <= 4 ? 'grid-cols-4' : 'grid-cols-3';

  return (
    <div>
      <div className={`grid gap-3 mb-3 ${gridCols}`}>
        {items.map((item, i) => {
          const c = METRIC_COLORS[i % METRIC_COLORS.length];
          return (
            <div key={i} className={`relative group/metric ${c.bg} border ${c.border} rounded-xl p-4`}>
              <button onClick={() => removeItem(i)}
                className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/80 dark:bg-gray-900/80 text-gray-400 hover:text-red-500 text-xs opacity-0 group-hover/metric:opacity-100 transition-opacity flex items-center justify-center font-bold">x</button>
              <div className="flex items-baseline gap-1 mb-1">
                <input value={item.value} onChange={e => update(i, 'value', e.target.value)}
                  placeholder="42" className={`bg-transparent border-none outline-none text-3xl font-bold ${c.text} w-full placeholder-current/20`} />
                <input value={item.unit} onChange={e => update(i, 'unit', e.target.value)}
                  placeholder="unit" className={`bg-transparent border-none outline-none text-sm ${c.text} opacity-60 w-14 placeholder-current/30`} />
              </div>
              <input value={item.label} onChange={e => update(i, 'label', e.target.value)}
                placeholder="Metric name" className="block w-full bg-transparent border-none outline-none text-xs text-gray-500 placeholder-gray-300" />
            </div>
          );
        })}
      </div>
      {items.length < 6 && (
        <button onClick={addItem} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1.5 transition-colors">
          <span className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-gray-400">+</span>
          Add metric
        </button>
      )}
    </div>
  );
}

// ── TABLE BLOCK ───────────────────────────────────────────────────────────────
function TableBlock({ block, onUpdate }) {
  const headers = block.content?.headers || ['Column 1', 'Column 2'];
  const rows = block.content?.rows || [['', '']];

  const updateHeader = (i, val) => onUpdate(block.id, { ...block.content, headers: headers.map((h, idx) => idx === i ? val : h) });
  const updateCell = (r, c, val) => onUpdate(block.id, { ...block.content, rows: rows.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? val : cell) : row) });
  const addRow = () => onUpdate(block.id, { ...block.content, rows: [...rows, Array(headers.length).fill('')] });
  const addCol = () => onUpdate(block.id, { headers: [...headers, `Column ${headers.length + 1}`], rows: rows.map(r => [...r, '']) });
  const removeRow = (i) => onUpdate(block.id, { ...block.content, rows: rows.filter((_, ri) => ri !== i) });
  const removeCol = (i) => onUpdate(block.id, { headers: headers.filter((_, ci) => ci !== i), rows: rows.map(r => r.filter((_, ci) => ci !== i)) });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="relative group/col border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-0">
                <input value={h} onChange={e => updateHeader(i, e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-sm px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 text-left" />
                {headers.length > 1 && (
                  <button onClick={() => removeCol(i)}
                    className="absolute -top-2 right-0 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover/col:opacity-100 transition-opacity flex items-center justify-center z-10">x</button>
                )}
              </th>
            ))}
            <th className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-0 w-10">
              <button onClick={addCol} className="w-full py-2.5 text-gray-600 dark:text-gray-300 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-base leading-none">+</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="group/row hover:bg-gray-50/60 dark:hover:bg-gray-800/50 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="border border-gray-200 dark:border-gray-700 p-0">
                  <input value={cell} onChange={e => updateCell(ri, ci, e.target.value)} placeholder="-"
                    className="w-full bg-transparent border-none outline-none text-sm px-3 py-2 text-gray-700 dark:text-gray-300 placeholder-gray-200 dark:placeholder-gray-700" />
                </td>
              ))}
              <td className="border border-gray-200 dark:border-gray-700 p-0 w-10">
                {rows.length > 1 && (
                  <button onClick={() => removeRow(ri)}
                    className="w-full py-2 text-gray-300 hover:text-red-500 transition-colors text-xs opacity-0 group-hover/row:opacity-100">x</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} className="mt-2 text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1.5 transition-colors">
        <span className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center">+</span>
        Add row
      </button>
    </div>
  );
}

// ── TIMELINE BLOCK ────────────────────────────────────────────────────────────
function TimelineBlock({ block, onUpdate }) {
  const items = block.content?.items || [{ date: '', title: '', description: '' }];
  const update = (i, field, val) => onUpdate(block.id, { items: items.map((item, idx) => idx === i ? { ...item, [field]: val } : item) });
  const addItem = () => onUpdate(block.id, { items: [...items, { date: '', title: '', description: '' }] });
  const removeItem = (i) => onUpdate(block.id, { items: items.filter((_, idx) => idx !== i) });

  return (
    <div>
      {items.map((item, i) => (
        <div key={i} className="group/tl flex gap-4">
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-200 mt-1.5 z-10" />
            {i < items.length - 1 && <div className="w-0.5 bg-blue-200 flex-1 my-1" style={{ minHeight: 32 }} />}
          </div>
          <div className="flex-1 pb-5 min-w-0">
            <div className="flex items-start gap-2 mb-1.5">
              <input value={item.date} onChange={e => update(i, 'date', e.target.value)}
                placeholder="Date / Phase" className="text-xs font-mono text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 outline-none w-32 placeholder-blue-300" />
              <input value={item.title} onChange={e => update(i, 'title', e.target.value)}
                placeholder="Milestone title" className="flex-1 text-sm font-semibold text-gray-900 bg-transparent border-none outline-none placeholder-gray-300" />
              {items.length > 1 && (
                <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover/tl:opacity-100 transition-opacity flex-shrink-0">x</button>
              )}
            </div>
            <textarea value={item.description} onChange={e => update(i, 'description', e.target.value)}
              placeholder="What happened at this milestone? (optional)"
              rows={2} className="w-full text-sm text-slate-600 bg-transparent border-none outline-none resize-none placeholder-slate-300" />
          </div>
        </div>
      ))}
      <button onClick={addItem} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1.5 transition-colors ml-6">
        <span className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center">+</span>
        Add milestone
      </button>
    </div>
  );
}

// ── DRAG HANDLE ───────────────────────────────────────────────────────────────
function DragHandle({ dragHandleProps }) {
  return (
    <div {...dragHandleProps}
      className="block-drag-handle absolute -left-7 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
      title="Drag to reorder">
      <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
        <circle cx="2.5" cy="2.5" r="1.5" fill="#d1d5db" />
        <circle cx="7.5" cy="2.5" r="1.5" fill="#d1d5db" />
        <circle cx="2.5" cy="8"   r="1.5" fill="#d1d5db" />
        <circle cx="7.5" cy="8"   r="1.5" fill="#d1d5db" />
        <circle cx="2.5" cy="13.5" r="1.5" fill="#d1d5db" />
        <circle cx="7.5" cy="13.5" r="1.5" fill="#d1d5db" />
      </svg>
    </div>
  );
}

// ── ADD BLOCK BUTTON ──────────────────────────────────────────────────────────
function AddBlockButton({ index, onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const groups = BLOCK_GROUPS.map(g => ({ name: g, items: BLOCK_TYPES.filter(b => b.group === g) }));

  return (
    <div ref={ref} className="relative flex items-center gap-2 my-1 group/addbtn">
      <div className="flex-1 h-px bg-transparent group-hover/addbtn:bg-gray-100 transition-colors" />
      <button onClick={() => setOpen(o => !o)}
        className="opacity-0 group-hover/addbtn:opacity-100 focus:opacity-100 transition-all px-3 py-0.5 bg-white border border-gray-200 rounded-full text-xs text-gray-400 hover:text-blue-600 hover:border-blue-300 shadow-sm flex items-center gap-1 focus:outline-none">
        <span className="text-sm leading-none font-light">+</span> Add block
      </button>
      <div className="flex-1 h-px bg-transparent" />

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-30 w-96 overflow-hidden">
          <div className="px-3 pt-2.5 pb-1 border-b border-gray-100 dark:border-gray-800">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Insert block</span>
          </div>
          <div className="max-h-56 overflow-y-auto py-1 grid grid-cols-2">
            {groups.map(g => (
              <div key={g.name}>
                <div className="px-3 pt-2 pb-0.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">{g.name}</div>
                {g.items.map(bt => (
                  <button key={bt.type} onClick={() => { onAdd(bt.type, index); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-blue-700 dark:hover:text-blue-300 transition-colors text-left">
                    <span className="w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md flex-shrink-0">
                      <EngineeringIcon name={bt.icon} size="0.95rem" />
                    </span>
                    <div>
                      <div className="font-medium leading-tight">{bt.label}</div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-500">{bt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN BLOCK EDITOR ─────────────────────────────────────────────────────────
export default function BlockEditor({ blocks, onBlocksChange, projectId }) {
  const addBlock = useCallback((type, afterIndex) => {
    const newBlock = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      content: DEFAULT_CONTENT[type] || {},
      sort_order: afterIndex + 1,
    };
    const next = [...blocks];
    next.splice(afterIndex + 1, 0, newBlock);
    onBlocksChange(next.map((b, i) => ({ ...b, sort_order: i })));
  }, [blocks, onBlocksChange]);

  const updateBlock = useCallback((blockId, content) => {
    onBlocksChange(blocks.map(b => b.id === blockId ? { ...b, content } : b));
  }, [blocks, onBlocksChange]);

  const deleteBlock = useCallback((blockId) => {
    onBlocksChange(blocks.filter(b => b.id !== blockId));
  }, [blocks, onBlocksChange]);

  const onDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const next = Array.from(blocks);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    onBlocksChange(next.map((b, i) => ({ ...b, sort_order: i })));
  };

  const renderBlock = (block, index) => {
    const props = { block, onUpdate: updateBlock, onDelete: deleteBlock, projectId, blockIndex: index, onAddBlock: addBlock };
    switch (block.type) {
      case 'text':     return <TextBlock {...props} />;
      case 'heading':  return <HeadingBlock {...props} />;
      case 'image':    return <ImageBlock {...props} />;
      case 'gallery':  return <GalleryBlock {...props} />;
      case 'video':    return <VideoBlock {...props} />;
      case 'code':     return <CodeBlock {...props} />;
      case 'callout':  return <CalloutBlock {...props} />;
      case 'file':     return <FileBlock {...props} />;
      case 'embed':    return <EmbedBlock {...props} />;
      case 'metrics':  return <MetricsBlock {...props} />;
      case 'table':    return <TableBlock {...props} />;
      case 'timeline': return <TimelineBlock {...props} />;
      case 'divider':
        return (
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-300 text-xs">section</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        );
      default:
        return <div className="text-sm text-gray-400 italic p-2">Unknown block: {block.type}</div>;
    }
  };

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (blocks.length === 0) {
    return (
      <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl hover:border-gray-300 transition-colors">
        <EngineeringIcon name="document-edit" size="2.5rem" className="mx-auto mb-3" />
        <p className="text-gray-600 text-sm mb-1 font-medium">Start building your project page</p>
        <p className="text-gray-400 text-xs mb-6">
          Type <kbd className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 font-mono text-[11px]">/</kbd> in a text block for commands, or pick a block below
        </p>
        <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
          {BLOCK_TYPES.slice(0, 6).map(bt => (
            <button key={bt.type} onClick={() => addBlock(bt.type, -1)}
              className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shadow-sm">
              <EngineeringIcon name={bt.icon} size="1rem" /> {bt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Editor ──────────────────────────────────────────────────────────────────
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="blocks">
        {(provided, snapshot) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className={`transition-colors rounded-xl ${snapshot.isDraggingOver ? 'bg-blue-50/40' : ''}`}
          >
            {/* Add before first block */}
            <AddBlockButton index={-1} onAdd={addBlock} />

            {blocks.map((block, index) => (
              <Draggable key={String(block.id)} draggableId={String(block.id)} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={`group/block relative transition-all duration-150 ${
                      snapshot.isDragging
                        ? 'shadow-2xl ring-2 ring-blue-400 ring-offset-2 rounded-xl bg-white dark:bg-gray-900 z-50 scale-[1.01] rotate-[0.5deg]'
                        : ''
                    }`}
                  >
                    <div className="relative">
                      <DragHandle dragHandleProps={provided.dragHandleProps} />

                      {/* Block content area */}
                      <div className="py-1">
                        {renderBlock(block, index)}
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => deleteBlock(block.id)}
                        title="Delete block"
                        className="absolute -right-8 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 hover:border-red-200 dark:hover:border-red-800 shadow-sm opacity-0 group-hover/block:opacity-100 transition-opacity text-sm font-bold"
                      >
                        x
                      </button>
                    </div>

                    {/* Add after this block */}
                    <AddBlockButton index={index} onAdd={addBlock} />
                  </div>
                )}
              </Draggable>
            ))}

            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
