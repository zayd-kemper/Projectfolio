// frontend/src/pages/ProfileSettingsPage.jsx
import { useState, useEffect } from 'react';
import TagInput, { SKILL_SUGGESTIONS } from '../components/shared/TagInput';
import { useAuth } from '../hooks/useAuth';
import DashboardLayout from '../components/shared/DashboardLayout';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import { uploadMedia } from '../utils/uploadMedia';
import EngineeringIcon from '../components/shared/EngineeringIcon';

const formatStat = (value) => Number(value || 0).toLocaleString();

function DiscoverActivityStats({ stats, loading, error }) {
  const items = [
    { key: 'posts', label: 'Posts', value: stats?.posts, icon: 'document-edit' },
    { key: 'makers_followed', label: 'Makers followed', value: stats?.makers_followed, icon: 'team-node' },
    { key: 'comments', label: 'Comments', value: stats?.comments, icon: 'message' },
    { key: 'saves', label: 'Saves', value: stats?.saves, icon: 'pin' },
  ];

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Discover activity</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Private stats from your posts and interactions.</p>
        </div>
        <EngineeringIcon name="analytics-gauge" size="1.4rem" />
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.key} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{item.label}</span>
                <EngineeringIcon name={item.icon} size="0.95rem" />
              </div>
              {loading ? (
                <div className="h-7 w-14 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
              ) : (
                <div className="text-2xl font-bold text-gray-950 dark:text-gray-100">{formatStat(item.value)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProfileSettingsPage({ noLayout = false }) {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
  full_name: '', username: '', headline: '', bio: '', location: '',
  website: '', linkedin_url: '', github_url: '', skills: [],
  phone: '', contact_email: '',
});
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [discoverStats, setDiscoverStats] = useState(null);
  const [discoverStatsLoading, setDiscoverStatsLoading] = useState(true);
  const [discoverStatsError, setDiscoverStatsError] = useState('');

  useEffect(() => {
    api.get('/auth/me').then(res => {
      const u = res.data.user;
      setForm({
        full_name: u.full_name || '',
        username: u.username || '',
        headline: u.headline || '',
        bio: u.bio || '',
        location: u.location || '',
        website: u.website || '',
        linkedin_url: u.linkedin_url || '',
        github_url: u.github_url || '',
        skills: u.skills || [],
        phone: u.phone || '',
        contact_email: u.contact_email || u.email || '',
      });
      setAvatarUrl(u.avatar_url || '');
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    setDiscoverStatsLoading(true);
    api.get('/discover/me/stats')
      .then(res => {
        if (!mounted) return;
        setDiscoverStats(res.data.stats || null);
        setDiscoverStatsError('');
      })
      .catch(() => {
        if (mounted) setDiscoverStatsError('Discover activity stats are temporarily unavailable.');
      })
      .finally(() => {
        if (mounted) setDiscoverStatsLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSkillChange = (newSkills) => setForm(f => ({ ...f, skills: newSkills }));

  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'image/*': [] },
    multiple: false,
    onDrop: async (files) => {
      setAvatarUploading(true);
      try {
        const uploaded = await uploadMedia(files[0]);
        const res = await api.put('/settings/avatar', { avatar_url: uploaded.url });
        setAvatarUrl(res.data.avatar_url);
        updateUser({ avatar_url: res.data.avatar_url });
        toast.success('Avatar updated!');
      } catch { toast.error('Avatar upload failed.'); }
      finally { setAvatarUploading(false); }
    },
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/auth/profile', form);
      updateUser(res.data.user);
      toast.success('Profile saved!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const inner = (
    <>
      {!noLayout && (
        <>
          <h1 className="page-title mb-2">Profile</h1>
          <p className="page-subtitle mb-8">This information appears on your public portfolio page.</p>
        </>
      )}

      <div className="max-w-2xl space-y-8">
        <DiscoverActivityStats stats={discoverStats} loading={discoverStatsLoading} error={discoverStatsError} />

        {/* Avatar */}
        <div className="card p-6">
          <label className="form-label mb-4 block">Profile photo</label>
          <div className="flex items-center gap-5">
            <div {...getRootProps()} className="cursor-pointer">
              <input {...getInputProps()} />
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-blue-50 flex items-center justify-center border-2 border-dashed border-gray-200 hover:border-blue-300 transition-colors">
                {avatarUploading ? (
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                ) : avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl text-blue-200">{form.full_name?.charAt(0) || '?'}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">Upload a photo</div>
              <div className="text-xs text-gray-500">Click or drag an image. PNG or JPG up to 10MB.</div>
            </div>
          </div>
        </div>

        {/* Basic info */}
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Basic info</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Full name</label>
              <input name="full_name" value={form.full_name} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">Username</label>
              <div className="flex items-center">
                <span className="text-sm text-gray-400 mr-1">/</span>
                <input name="username" value={form.username} onChange={handleChange} className="form-input" />
              </div>
            </div>
          </div>
          <div>
            <label className="form-label">Headline</label>
            <input name="headline" value={form.headline} onChange={handleChange} placeholder="e.g. Mechanical Engineering at MIT, NASA Research Intern" className="form-input" />
          </div>
          <div>
            <label className="form-label">Bio</label>
            <textarea name="bio" value={form.bio} onChange={handleChange} rows={4} className="form-textarea" placeholder="A brief bio about yourself and your interests..." />
          </div>
          <div>
            <label className="form-label">Location</label>
            <input name="location" value={form.location} onChange={handleChange} placeholder="Cambridge, MA" className="form-input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Contact email</label>
              <input name="contact_email" value={form.contact_email} onChange={handleChange}
                placeholder="Public contact email" className="form-input" />
              <p className="text-xs text-gray-400 mt-1">Shown on your public portfolio</p>
            </div>
            <div>
              <label className="form-label">Phone number</label>
              <input name="phone" value={form.phone} onChange={handleChange}
                placeholder="+1 (555) 000-0000" className="form-input" />
              <p className="text-xs text-gray-400 mt-1">Optional. Shown on portfolio.</p>
            </div>
          </div>
        </div>

        {/* Skills */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Skills</h3>
          <p className="text-xs text-gray-500 mb-4">These appear as tags on your portfolio (e.g. Python, SolidWorks, MATLAB)</p>
          <TagInput
            values={form.skills}
            onChange={handleSkillChange}
            suggestions={SKILL_SUGGESTIONS}
            placeholder="e.g. Python, SolidWorks, MATLAB..."
          />
        </div>

        {/* Links */}
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Links</h3>
          <div>
            <label className="form-label">Personal website</label>
            <input name="website" value={form.website} onChange={handleChange} placeholder="https://yourwebsite.com" className="form-input" />
          </div>
          <div>
            <label className="form-label">LinkedIn URL</label>
            <input name="linkedin_url" value={form.linkedin_url} onChange={handleChange} placeholder="https://linkedin.com/in/yourname" className="form-input" />
          </div>
          <div>
            <label className="form-label">GitHub URL</label>
            <input name="github_url" value={form.github_url} onChange={handleChange} placeholder="https://github.com/yourname" className="form-input" />
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </>
  );

  return noLayout ? inner : <DashboardLayout>{inner}</DashboardLayout>;
}
