import { useState, useEffect } from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import EngineeringIcon from '../shared/EngineeringIcon';

export default function CollaboratorPanel({ projectId, isOwner }) {
  const [collaborators, setCollaborators] = useState([]);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    if (projectId) fetchCollaborators();
  }, [projectId]);

  const fetchCollaborators = async () => {
    try {
      const response = await api.get(`/collaborators/project/${projectId}`);
      setCollaborators(response.data.collaborators);
    } catch {}
  };

  const handleInvite = async () => {
    if (!inviteUsername.trim()) return;
    setInviting(true);
    try {
      const response = await api.post(`/collaborators/project/${projectId}/invite`, {
        username: inviteUsername.trim().replace('@', ''),
      });
      toast.success(response.data.message);
      setInviteUsername('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  };

  const handleGenerateLink = async () => {
    setGeneratingLink(true);
    try {
      const response = await api.post(`/collaborators/project/${projectId}/invite-link`);
      setInviteLink(response.data.link);
    } catch {
      toast.error('Failed to generate invite link.');
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied.');
  };

  const handleRemove = async (userId) => {
    if (!confirm('Remove this collaborator?')) return;
    try {
      await api.delete(`/collaborators/project/${projectId}/collaborator/${userId}`);
      setCollaborators((current) => current.filter((item) => item.user_id !== userId));
      toast.success('Collaborator removed.');
    } catch {
      toast.error('Failed to remove collaborator.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
          Collaborators ({collaborators.length})
        </h4>
        {collaborators.length === 0 ? (
          <p className="text-sm text-gray-400">No collaborators yet.</p>
        ) : (
          <div className="space-y-2">
            {collaborators.map((collaborator) => (
              <div key={collaborator.id} className="flex items-center gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-900">
                  {collaborator.avatar_url
                    ? <img src={collaborator.avatar_url} alt="" className="h-full w-full object-cover" />
                    : collaborator.full_name?.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{collaborator.full_name}</div>
                  <div className="text-xs text-gray-500">@{collaborator.username}</div>
                </div>
                {isOwner && (
                  <button onClick={() => handleRemove(collaborator.user_id)} className="rounded px-2 py-1 text-xs text-red-400 hover:text-red-600">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isOwner && (
        <>
          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Invite by username</h4>
            <div className="flex gap-2">
              <input
                value={inviteUsername}
                onChange={(event) => setInviteUsername(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleInvite()}
                placeholder="@username"
                className="form-input flex-1 text-sm"
              />
              <button onClick={handleInvite} disabled={inviting || !inviteUsername.trim()} className="btn-primary px-4 text-xs">
                {inviting ? '...' : 'Invite'}
              </button>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Invite link</h4>
            {inviteLink ? (
              <div className="flex gap-2">
                <input readOnly value={inviteLink} className="form-input flex-1 font-mono text-xs" />
                <button onClick={handleCopyLink} className="btn-secondary px-3 text-xs">Copy</button>
              </div>
            ) : (
              <button onClick={handleGenerateLink} disabled={generatingLink} className="btn-secondary w-full justify-center text-sm">
                {generatingLink ? 'Generating...' : (
                  <>
                    <EngineeringIcon name="link" size="1em" />
                    <span>Generate invite link</span>
                  </>
                )}
              </button>
            )}
            <p className="mt-1 text-xs text-gray-400">Link expires in 7 days.</p>
          </div>
        </>
      )}
    </div>
  );
}
