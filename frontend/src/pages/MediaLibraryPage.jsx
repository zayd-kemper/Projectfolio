// frontend/src/pages/MediaLibraryPage.jsx
import { useEffect, useState } from 'react';
import DashboardLayout from '../components/shared/DashboardLayout';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import { format } from 'date-fns';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import { uploadMedia } from '../utils/uploadMedia';

const FILTERS = [
  { id: 'all', label: 'All files', icon: 'open-folder' },
  { id: 'image', label: 'Images', icon: 'media-frame' },
  { id: 'video', label: 'Videos', icon: 'video-frame' },
  { id: 'document', label: 'Documents', icon: 'attachment' },
];

function iconForFileType(type) {
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
}

export default function MediaLibraryPage() {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [filter, setFilter] = useState('all');

  const fetchMedia = async () => {
    try {
      const res = await api.get('/media');
      setMedia(res.data.media);
    } catch {
      toast.error('Failed to load media.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': [],
      'video/*': [],
      'application/pdf': [],
      'application/msword': [],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
      'application/vnd.ms-excel': [],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [],
      'application/vnd.ms-powerpoint': [],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': [],
      'application/zip': [],
      'application/json': [],
      'text/plain': [],
      'text/csv': [],
      'application/octet-stream': [],
    },
    onDrop: async (files) => {
      setUploading(true);
      const results = [];
      for (const file of files) {
        try {
          const uploaded = await uploadMedia(file);
          results.push(uploaded.media);
        } catch {
          toast.error(`Failed to upload ${file.name}`);
        }
      }
      setMedia((current) => [...results, ...current]);
      toast.success(`${results.length} file${results.length !== 1 ? 's' : ''} uploaded.`);
      setUploading(false);
    },
  });

  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.filename}"?`)) return;
    setDeleting(item.id);
    try {
      await api.delete(`/media/${item.id}`);
      setMedia((current) => current.filter((entry) => entry.id !== item.id));
      toast.success('File deleted.');
    } catch {
      toast.error('Delete failed.');
    } finally {
      setDeleting(null);
    }
  };

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copied.');
  };

  const filtered = filter === 'all'
    ? media
    : filter === 'image'
      ? media.filter((item) => item.file_type?.startsWith('image/'))
      : filter === 'video'
        ? media.filter((item) => item.file_type?.startsWith('video/'))
        : media.filter((item) => !item.file_type?.startsWith('image/') && !item.file_type?.startsWith('video/'));

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="page-title">Media Library</h1>
          <p className="page-subtitle">{media.length} file{media.length !== 1 ? 's' : ''} uploaded</p>
        </div>
      </div>

      <div
        {...getRootProps()}
        className={`mb-6 cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          isDragActive
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800/60 dark:hover:border-gray-500'
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex items-center justify-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span className="text-gray-500 dark:text-gray-400">Uploading files...</span>
          </div>
        ) : (
          <div className="mx-auto max-w-xl">
            <EngineeringIcon name="cloud-upload" size="2.5rem" className="mx-auto mb-3" />
            <p className="font-medium text-gray-700 dark:text-gray-200">Drop files here or click to upload</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Images, videos, PDFs, Office files, CAD assets, archives, and code files.</p>
          </div>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === item.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <EngineeringIcon name={item.icon} size="1rem" className={filter === item.id ? 'brightness-0 invert' : ''} />
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="aspect-square animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <EngineeringIcon name="open-folder" size="2.5rem" className="mx-auto mb-3" />
          <p>No {filter !== 'all' ? filter + 's' : 'files'} yet. Upload files above to attach them to projects.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((item) => (
            <div key={item.id} className="card group relative overflow-hidden">
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-gray-50 dark:bg-gray-800">
                {item.file_type?.startsWith('image/') ? (
                  <img src={item.url} alt={item.filename} className="h-full w-full object-cover" />
                ) : item.file_type?.startsWith('video/') ? (
                  <video src={item.url} className="h-full w-full object-cover" />
                ) : (
                  <EngineeringIcon name={iconForFileType(item.file_type)} size="2.5rem" />
                )}
              </div>

              <div className="p-3">
                <div className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">{item.filename}</div>
                <div className="mt-0.5 text-xs text-gray-400">
                  {item.file_size ? `${(item.file_size / 1024).toFixed(0)} KB / ` : ''}
                  {format(new Date(item.created_at), 'MMM d')}
                </div>
              </div>

              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => handleCopyUrl(item.url)}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:bg-gray-200 dark:hover:bg-white"
                >
                  Copy URL
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={deleting === item.id}
                  className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
                >
                  {deleting === item.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
