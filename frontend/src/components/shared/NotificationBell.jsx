import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { formatDistanceToNow } from 'date-fns';
import EngineeringIcon from './EngineeringIcon';

const POLL_INTERVAL = 60000;
const BACKOFF_INTERVAL = 300000;
const SHARED_REFRESH_GAP = 15000;
const POLL_LOCK_TTL = 10000;
const LAST_FETCH_KEY = 'projectfolio.notifications.lastFetch';
const POLL_LOCK_KEY = 'projectfolio.notifications.pollLock';

const now = () => Date.now();

const readNumber = (key) => {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) ? value : 0;
};

const acquirePollLock = () => {
  const currentTime = now();
  const lastFetch = readNumber(LAST_FETCH_KEY);
  const lockUntil = readNumber(POLL_LOCK_KEY);

  if (currentTime - lastFetch < SHARED_REFRESH_GAP) return false;
  if (lockUntil > currentTime) return false;

  window.localStorage.setItem(POLL_LOCK_KEY, String(currentTime + POLL_LOCK_TTL));
  return readNumber(POLL_LOCK_KEY) > currentTime;
};

const releasePollLock = () => {
  window.localStorage.removeItem(POLL_LOCK_KEY);
};

const getRetryDelay = (err) => {
  const retryAfter = Number(err.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.max(retryAfter * 1000, POLL_INTERVAL);
  }
  return BACKOFF_INTERVAL;
};

const iconForNotification = (type) => {
  switch (type) {
    case 'project_invite': return 'collaboration';
    case 'team_invite': return 'team-node';
    case 'collaborator_joined': return 'signal-success';
    case 'team_member_joined': return 'signal-success';
    default: return 'info';
  }
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const intervalRef = useRef(null);
  const inFlightRef = useRef(false);
  const backoffUntilRef = useRef(0);
  const navigate = useNavigate();

  const startPolling = (delay = POLL_INTERVAL) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchNotifications, delay);
  };

  useEffect(() => {
    fetchNotifications();
    startPolling();
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    const handleClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const fetchNotifications = async ({ ignoreSharedCooldown = false } = {}) => {
    if (inFlightRef.current) return;

    const currentTime = now();
    if (backoffUntilRef.current > currentTime) return;
    const pollLockAcquired = ignoreSharedCooldown ? false : acquirePollLock();
    if (!ignoreSharedCooldown && !pollLockAcquired) return;

    inFlightRef.current = true;
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data.notifications);
      setUnreadCount(response.data.unread_count);
      window.localStorage.setItem(LAST_FETCH_KEY, String(now()));
      backoffUntilRef.current = 0;
      startPolling(POLL_INTERVAL);
    } catch (err) {
      if (err.response?.status === 429) {
        const retryDelay = getRetryDelay(err);
        backoffUntilRef.current = now() + retryDelay;
        startPolling(retryDelay);
      }
    } finally {
      inFlightRef.current = false;
      if (pollLockAcquired) releasePollLock();
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      await api.put(`/notifications/${notification.id}/read`).catch(() => {});
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
      setUnreadCount((count) => Math.max(0, count - 1));
    }

    const data = notification.data;
    if ((notification.type === 'project_invite' || notification.type === 'team_invite') && data.invite_token) {
      navigate(`/join/${data.invite_token}`);
    } else if (notification.type === 'collaborator_joined' && data.project_id) {
      navigate(`/dashboard/projects/${data.project_id}/edit`);
    } else if (notification.type === 'team_member_joined' && data.team_id) {
      navigate('/dashboard/teams');
    }

    setOpen(false);
  };

  const handleDelete = async (event, notificationId) => {
    event.stopPropagation();
    await api.delete(`/notifications/${notificationId}`).catch(() => {});
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="touch-target relative flex items-center justify-center rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-muted"
        title="Notifications"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <EngineeringIcon name="info" size="1.1rem" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute -right-24 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line-subtle bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-accent-text hover:text-accent-text">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-ink-muted">
                <EngineeringIcon name="info" size="2rem" className="mx-auto mb-2" />
                No notifications yet
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`relative flex items-start gap-2 border-b border-line-subtle transition-colors hover:bg-surface-muted focus-within:bg-surface-muted ${!notification.is_read ? 'bg-accent-surface/50' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <EngineeringIcon name={iconForNotification(notification.type)} size="1.25rem" className="mt-0.5 flex-shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm leading-snug ${!notification.is_read ? 'font-medium text-ink' : 'text-ink-secondary'}`}>
                        {notification.title}
                      </span>
                      {notification.message && (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-ink-muted">{notification.message}</span>
                      )}
                      <span className="mt-1 block text-xs text-ink-muted">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </span>
                    </span>
                    {!notification.is_read && <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-accent" />}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => handleDelete(event, notification.id)}
                    aria-label={`Dismiss notification: ${notification.title}`}
                    className="mr-2 mt-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-ink-muted hover:text-ink-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <EngineeringIcon name="close" size="0.7rem" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
