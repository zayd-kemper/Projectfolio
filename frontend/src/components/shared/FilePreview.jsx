import { useEffect, useMemo, useState } from 'react';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'log',
  'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'py', 'c', 'cpp', 'h',
  'hpp', 'java', 'rs', 'go', 'sql', 'sh', 'ps1',
]);

const extensionFrom = (file = {}) => {
  const source = String(file.filename || file.url || '').split('?')[0].split('#')[0];
  const match = source.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : '';
};

export const inferFilePreviewKind = (file = {}) => {
  const type = String(file.type || file.file_type || '').toLowerCase();
  const ext = extensionFrom(file);

  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(ext)) return 'image';
  if (type.startsWith('video/') || ['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'video';
  if (type.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'flac', 'oga'].includes(ext)) return 'audio';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type.startsWith('text/') || type.includes('json') || type.includes('xml') || TEXT_EXTENSIONS.has(ext)) return 'text';
  return 'download';
};

const readableFileName = (file = {}) => file.filename || file.name || 'Attached file';

const previewBaseOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost';
};

export const normalizePreviewUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const baseOrigin = previewBaseOrigin();
    const parsed = new URL(raw, baseOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (parsed.origin === baseOrigin && /^\/api(?:\/|$)/i.test(parsed.pathname)) return '';
    return parsed.href;
  } catch {
    return '';
  }
};

export const canPreviewFile = (file = {}) => Boolean(normalizePreviewUrl(file?.url)) && inferFilePreviewKind(file) !== 'download';

function TextFilePreview({ file }) {
  const [state, setState] = useState({ loading: true, error: '', text: '' });
  const url = useMemo(() => normalizePreviewUrl(file?.url), [file?.url]);

  useEffect(() => {
    if (!url) {
      setState({ loading: false, error: 'No file URL is available.', text: '' });
      return undefined;
    }

    const controller = new AbortController();
    setState({ loading: true, error: '', text: '' });

    fetch(url, { signal: controller.signal, credentials: 'omit' })
      .then((response) => {
        if (!response.ok) throw new Error('Preview could not be loaded.');
        const length = Number(response.headers.get('content-length') || 0);
        if (length > 250000) throw new Error('This text file is too large to preview inline.');
        return response.text();
      })
      .then((text) => {
        if (text.length > 250000) throw new Error('This text file is too large to preview inline.');
        setState({ loading: false, error: '', text });
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState({ loading: false, error: error.message || 'Preview could not be loaded.', text: '' });
      });

    return () => controller.abort();
  }, [url]);

  if (state.loading) {
    return (
      <div className="skeleton-shimmer h-56 rounded-xl" aria-label="Loading file preview" />
    );
  }

  if (state.error) {
    return <PreviewFallback file={file} message={state.error} />;
  }

  return (
    <pre className="max-h-96 overflow-auto rounded-xl bg-gray-950 p-4 text-xs leading-relaxed text-gray-100">
      <code>{state.text}</code>
    </pre>
  );
}

function PreviewFallback({ file, message = 'This file type cannot be previewed safely in the app yet.' }) {
  const previewUrl = normalizePreviewUrl(file?.url);

  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-muted p-5 text-sm text-ink-muted">
      <p className="font-medium text-ink">Preview unavailable</p>
      <p className="mt-1 text-xs text-ink-muted">{message}</p>
      {previewUrl && (
        <a href={previewUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-semibold text-accent-text hover:underline">
          Open file in a new tab
        </a>
      )}
    </div>
  );
}

export default function FilePreview({ file, className = '' }) {
  const kind = useMemo(() => inferFilePreviewKind(file), [file]);
  const previewUrl = useMemo(() => normalizePreviewUrl(file?.url), [file?.url]);
  const name = readableFileName(file);

  if (!file?.url) return <PreviewFallback file={file} message="No file URL is available." />;
  if (!previewUrl) return <PreviewFallback file={file} message="This file URL cannot be previewed safely." />;

  return (
    <div className={`rounded-xl border border-line bg-surface p-3 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-ink">{name}</p>
          <p className="text-[11px] font-medium text-ink-muted">{kind === 'download' ? 'File attachment' : `${kind} preview`}</p>
        </div>
        <a href={previewUrl} target="_blank" rel="noreferrer" className="flex-shrink-0 text-xs font-semibold text-accent-text hover:underline">
          Open
        </a>
      </div>

      {kind === 'image' && <img loading="lazy" decoding="async" src={previewUrl} alt={name} className="max-h-[520px] w-full rounded-xl object-contain bg-surface-muted" />}
      {kind === 'video' && <video src={previewUrl} controls className="w-full rounded-xl bg-black" />}
      {kind === 'audio' && <audio src={previewUrl} controls className="w-full" />}
      {kind === 'pdf' && (
        <iframe
          src={previewUrl}
          title={`${name} preview`}
          className="h-[560px] w-full rounded-xl border border-line bg-white"
          sandbox=""
          referrerPolicy="no-referrer"
        />
      )}
      {kind === 'text' && <TextFilePreview file={file} />}
      {kind === 'download' && <PreviewFallback file={file} />}
    </div>
  );
}
