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
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
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
        className="relative rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
        title="Notifications"
      >
        <EngineeringIcon name="info" size="1.1rem" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute -right-24 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-blue-600 hover:text-blue-700">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                <EngineeringIcon name="info" size="2rem" className="mx-auto mb-2" />
                No notifications yet
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`flex cursor-pointer items-start gap-3 border-b border-gray-50 px-4 py-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700 ${!notification.is_read ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}
                >
                  <EngineeringIcon name={iconForNotification(notification.type)} size="1.25rem" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-snug ${!notification.is_read ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                        {notification.title}
                      </p>
                      <button
                        onClick={(event) => handleDelete(event, notification.id)}
                        className="mt-0.5 flex-shrink-0 text-xs text-gray-300 hover:text-gray-500"
                      >
                        x
                      </button>
                    </div>
                    {notification.message && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{notification.message}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!notification.is_read && <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
