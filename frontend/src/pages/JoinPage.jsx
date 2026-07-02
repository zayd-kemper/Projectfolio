import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function JoinPage() {
  const { token } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      localStorage.setItem('pending_invite_token', token);
      navigate(`/login?redirect=/join/${token}`);
    } else {
      handleJoin();
    }
  }, [user, loading]);

  const handleJoin = async () => {
    try {
      const response = await api.post(`/collaborators/join/${token}`);
      setResult(response.data);
      setStatus('success');
      toast.success(response.data.message);
    } catch (err) {
      if (err.response?.data?.error?.includes('already')) {
        setResult({ type: 'project' });
        setStatus('success');
      } else {
        setStatus('error');
      }
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-gray-500">Processing your invitation...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="card max-w-md p-10 text-center">
          <EngineeringIcon name="clock" size="3rem" className="mx-auto mb-4" />
          <h2 className="mb-2 text-2xl font-semibold text-gray-900">Invitation expired</h2>
          <p className="mb-6 text-gray-500">This invitation link is invalid or has expired. Ask the owner to send a new one.</p>
          <Link to="/dashboard" className="btn-primary">Go to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="card max-w-md p-10 text-center">
        <EngineeringIcon name="signal-success" size="3rem" className="mx-auto mb-4" />
        <h2 className="mb-2 text-2xl font-semibold text-gray-900">
          {result?.type === 'team' ? 'You joined the team' : 'You joined the project'}
        </h2>
        <p className="mb-6 text-gray-500">You can now collaborate and contribute.</p>
        <Link to={result?.type === 'team' ? '/dashboard/teams' : '/dashboard'} className="btn-primary">
          {result?.type === 'team' ? 'View team' : 'Go to dashboard'}
        </Link>
      </div>
    </div>
  );
}
