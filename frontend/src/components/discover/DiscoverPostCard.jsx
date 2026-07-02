import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import api from '../../utils/api';
import EngineeringIcon from '../shared/EngineeringIcon';
import { Avatar, ProjectMiniCard } from './DiscoverPrimitives';
import { buildTree, contextFor, cx, formatCount, typeFor } from './discoverConfig';

const seenImpressions = new Set();

function recordEvent(event) {
  return api.post('/discover/events', event).catch(() => {});
}

function LinkPreview({ preview }) {
  if (!preview?.url) return null;
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-accent-border"
    >
      <span className="mt-0.5 rounded-md bg-accent-surface p-2">
        <EngineeringIcon name="link" size="1.1rem" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{preview.title || preview.domain || preview.url}</span>
        {preview.description ? <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">{preview.description}</span> : null}
        <span className="mt-1 block truncate text-xs font-semibold text-accent-text">{preview.domain || preview.url}</span>
      </span>
    </a>
  );
}

function MediaGrid({ media = [] }) {
  if (!media.length) return null;
  const visible = media.slice(0, 4);
  return (
    <div className={cx('grid gap-2', visible.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
      {visible.map((item, index) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className={cx(
            'relative overflow-hidden rounded-lg border border-line bg-surface-muted',
            visible.length === 1 ? 'aspect-video' : 'aspect-[4/3]'
          )}
        >
          {item.file_type?.startsWith('image/') ? (
            <img src={item.thumbnail_url || item.url} alt={item.filename || ''} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <EngineeringIcon name={item.file_type?.startsWith('video/') ? 'video-frame' : 'attachment'} size="2rem" />
            </span>
          )}
          {index === 3 && media.length > 4 ? (
            <span className="absolute inset-0 flex items-center justify-center bg-gray-950/60 text-sm font-semibold text-white">
              +{media.length - 4}
            </span>
          ) : null}
        </a>
      ))}
    </div>
  );
}

function Comment({ comment, depth, post, user, onReply, onVote, onAccept }) {
  const isAuthor = user?.id === post.author_id;
  const canAccept = isAuthor && ['question', 'feedback_request'].includes(post.post_type) && !comment.parent_comment_id;
  return (
    <div className={cx('flex gap-3', depth > 0 && 'ml-9 border-l border-line pl-3')}>
      <Avatar url={comment.author_avatar} name={comment.author_name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/${comment.author_username}`} className="text-xs font-semibold text-ink hover:text-accent-text">
            {comment.author_name}
          </Link>
          <span className="text-[11px] text-ink-faint">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
          </span>
          {comment.is_answer ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <EngineeringIcon name="signal-success" size="0.75rem" />
              Accepted
            </span>
          ) : null}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">{comment.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-ink-muted">
          <button
            type="button"
            onClick={() => onVote(comment)}
            className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-muted', comment.voted_by_viewer && 'text-accent-text')}
          >
            <EngineeringIcon name="target" size="0.8rem" />
            Helpful {comment.helpful_count ? formatCount(comment.helpful_count) : ''}
          </button>
          <button type="button" onClick={() => onReply(comment)} className="rounded-md px-1.5 py-1 transition-colors hover:bg-surface-muted">
            Reply
          </button>
          {canAccept ? (
            <button type="button" onClick={() => onAccept(comment)} className="rounded-md px-1.5 py-1 text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
              Mark answer
            </button>
          ) : null}
        </div>
        {comment.replies?.length ? (
          <div className="mt-3 space-y-3">
            {comment.replies.map((reply) => (
              <Comment
                key={reply.id}
                comment={reply}
                depth={depth + 1}
                post={post}
                user={user}
                onReply={onReply}
                onVote={onVote}
                onAccept={onAccept}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CommentComposer({ user, placeholder, submitting, onSubmit, onCancel }) {
  const [body, setBody] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    if (!body.trim()) return;
    await onSubmit(body);
    setBody('');
  };
  return (
    <form onSubmit={submit} className="flex gap-3">
      <Avatar url={user?.avatar_url} name={user?.full_name} size="sm" />
      <div className="flex-1">
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, 1500))}
          rows={2}
          placeholder={placeholder}
          className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          {onCancel ? (
            <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface-muted">
              Cancel
            </button>
          ) : null}
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </form>
  );
}

function Discussion({ post, user, open, onCountChange }) {
  const [comments, setComments] = useState(post.comment_preview || []);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState('helpful');
  const [replyTo, setReplyTo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    api.get(`/discover/posts/${post.id}/comments?sort=${sort}`)
      .then((response) => {
        if (alive) setComments(response.data.comments || []);
      })
      .catch(() => toast.error('Could not load comments.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [open, post.id, sort]);

  const tree = useMemo(() => buildTree(comments), [comments]);

  const addComment = async (body) => {
    if (!user) {
      toast.error('Sign in to comment.');
      return;
    }
    setSubmitting(true);
    try {
      const response = replyTo
        ? await api.post(`/discover/comments/${replyTo.id}/replies`, { body, parent_comment_id: replyTo.id })
        : await api.post(`/discover/posts/${post.id}/comments`, { body });
      setComments((current) => [...current, response.data.comment]);
      setReplyTo(null);
      onCountChange?.(1);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const vote = async (comment) => {
    if (!user) {
      toast.error('Sign in to mark comments helpful.');
      return;
    }
    try {
      const response = comment.voted_by_viewer
        ? await api.delete(`/discover/comments/${comment.id}/vote`)
        : await api.post(`/discover/comments/${comment.id}/vote`);
      setComments((current) => current.map((item) => item.id === comment.id
        ? { ...item, voted_by_viewer: response.data.voted, helpful_count: response.data.helpful_count }
        : item));
    } catch {
      toast.error('Could not update helpful vote.');
    }
  };

  const accept = async (comment) => {
    try {
      await api.post(`/discover/posts/${post.id}/answer/${comment.id}`);
      setComments((current) => current.map((item) => ({ ...item, is_answer: item.id === comment.id })));
      toast.success('Answer marked.');
    } catch {
      toast.error('Could not mark answer.');
    }
  };

  if (!open) return null;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-surface-muted p-1">
          {['helpful', 'recent'].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSort(option)}
              className={cx(
                'rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors',
                sort === option ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted'
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="text-xs font-semibold text-ink-muted">{formatCount(comments.length)} comments</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((item) => <div key={item} className="skeleton-shimmer h-16 rounded-lg" />)}
        </div>
      ) : tree.length ? (
        <div className="space-y-4">
          {tree.map((comment) => (
            <Comment
              key={comment.id}
              comment={comment}
              depth={0}
              post={post}
              user={user}
              onReply={setReplyTo}
              onVote={vote}
              onAccept={accept}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line p-5 text-center text-sm text-ink-muted">
          Start the discussion with a specific observation or question.
        </div>
      )}

      <div className="mt-4">
        {user ? (
          <>
            {replyTo ? (
              <div className="mb-2 rounded-lg bg-accent-surface px-3 py-2 text-xs font-semibold text-accent-text">
                Replying to {replyTo.author_name}
              </div>
            ) : null}
            <CommentComposer
              user={user}
              submitting={submitting}
              placeholder={replyTo ? 'Write a useful reply...' : 'Add a thoughtful comment...'}
              onSubmit={addComment}
              onCancel={replyTo ? () => setReplyTo(null) : null}
            />
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            <Link to="/login" className="font-semibold text-accent-text hover:text-accent-hover">Sign in</Link> to join the discussion.
          </p>
        )}
      </div>
    </div>
  );
}

export default function DiscoverPostCard({ post, user, onDelete, onEdit, onHidden, onPostUpdate }) {
  const [liked, setLiked] = useState(Boolean(post.liked_by_viewer));
  const [saved, setSaved] = useState(Boolean(post.saved_by_viewer));
  const [following, setFollowing] = useState(Boolean(post.followed_author));
  const [likeCount, setLikeCount] = useState(Number(post.like_count || 0));
  const [saveCount, setSaveCount] = useState(Number(post.save_count || 0));
  const [commentCount, setCommentCount] = useState(Number(post.comment_count || 0));
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const accent = post.accent_color || '#2563eb';
  const type = typeFor(post.post_type);
  const context = contextFor(post.context);
  const isAuthor = user?.id === post.author_id || user?.username === post.author_username;
  const lookingFor = post.metadata?.looking_for || [];
  const linkPreview = post.metadata?.link_preview;

  useEffect(() => {
    if (seenImpressions.has(post.id)) return;
    seenImpressions.add(post.id);
    recordEvent({ event_type: 'post_card_impression', post_id: post.id, project_id: post.project_id, metadata: { surface: 'discover_feed' } });
  }, [post.id, post.project_id]);

  const requireUser = (message) => {
    if (user) return true;
    toast.error(message);
    return false;
  };

  const toggleLike = async () => {
    if (!requireUser('Sign in to like posts.')) return;
    if (busy) return;
    setBusy(true);
    try {
      const response = liked ? await api.delete(`/discover/posts/${post.id}/like`) : await api.post(`/discover/posts/${post.id}/like`);
      setLiked(response.data.liked);
      setLikeCount(Number(response.data.like_count || 0));
    } catch {
      toast.error('Could not update like.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSave = async () => {
    if (!requireUser('Sign in to save posts.')) return;
    try {
      const response = saved ? await api.delete(`/discover/posts/${post.id}/save`) : await api.post(`/discover/posts/${post.id}/save`);
      setSaved(response.data.saved);
      setSaveCount(Number(response.data.save_count || 0));
    } catch {
      toast.error('Could not update save.');
    }
  };

  const share = async () => {
    try {
      const response = await api.post(`/discover/posts/${post.id}/share`);
      await navigator.clipboard?.writeText(response.data.share_url);
      toast.success('Share link copied.');
    } catch {
      toast.error('Could not copy share link.');
    }
  };

  const follow = async () => {
    if (!requireUser('Sign in to follow makers.')) return;
    try {
      const response = following
        ? await api.delete(`/discover/users/${post.author_id}/follow`)
        : await api.post(`/discover/users/${post.author_id}/follow`);
      setFollowing(response.data.following);
    } catch {
      toast.error('Could not update follow.');
    }
  };

  const hide = async () => {
    if (!requireUser('Sign in to hide posts.')) return;
    try {
      await api.post(`/discover/posts/${post.id}/hide`, { reason: 'not_relevant' });
      onHidden?.(post.id);
      toast.success('Post hidden.');
    } catch {
      toast.error('Could not hide post.');
    }
  };

  const report = async () => {
    if (!requireUser('Sign in to report posts.')) return;
    const details = window.prompt('Optional detail for the moderation queue');
    try {
      await api.post(`/discover/posts/${post.id}/report`, { reason: 'other', details: details || null });
      toast.success('Report submitted.');
    } catch {
      toast.error('Could not submit report.');
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await api.delete(`/discover/posts/${post.id}`);
      onDelete?.(post.id);
      toast.success('Post deleted.');
    } catch {
      toast.error('Could not delete post.');
    }
  };

  const loadAnalytics = async () => {
    if (analyticsOpen) {
      setAnalyticsOpen(false);
      return;
    }
    setAnalyticsOpen(true);
    if (analytics) return;
    try {
      const response = await api.get(`/discover/posts/${post.id}/analytics?window=30d`);
      setAnalytics(response.data);
    } catch {
      toast.error('Could not load post analytics.');
    }
  };

  const projectClick = () => {
    recordEvent({ event_type: 'project_click', post_id: post.id, project_id: post.project_id, metadata: { surface: 'post_card' } });
  };

  const setCommentDelta = (delta) => {
    setCommentCount((count) => {
      const nextCount = Math.max(0, count + delta);
      onPostUpdate?.({ ...post, comment_count: nextCount });
      return nextCount;
    });
  };

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-sm">
      <header className="flex items-start gap-3">
        <Link to={`/${post.author_username}`}><Avatar url={post.author_avatar} name={post.author_name} accent={accent} size="md" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/${post.author_username}`} className="break-words text-sm font-semibold text-ink hover:text-accent-text">
              {post.author_name}
            </Link>
            {post.author_headline ? <span className="hidden truncate text-xs text-ink-muted sm:block">{post.author_headline}</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-ink-muted">
            <span>{formatDistanceToNow(new Date(post.published_at || post.created_at), { addSuffix: true })}</span>
            <span className="h-1 w-1 rounded-full bg-line" />
            <span className="inline-flex items-center gap-1">
              <EngineeringIcon name={type.icon} size="0.8rem" />
              {type.label}
            </span>
            <span className="inline-flex items-center gap-1">
              <EngineeringIcon name={context.icon} size="0.8rem" />
              {context.label}
            </span>
            {post.visibility === 'followers' ? <span>Followers only</span> : null}
          </div>
        </div>
        <div className="flex flex-none items-start gap-2">
          {!isAuthor ? (
            <button
              type="button"
              onClick={follow}
              className={cx(
                'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                following
                  ? 'border-line text-ink-muted hover:border-ink-faint'
                  : 'border-transparent text-white'
              )}
              style={following ? undefined : { backgroundColor: accent }}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          ) : null}
          <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-expanded={menuOpen}
            className="rounded-lg border border-line p-2 text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
            aria-label="Post actions"
          >
            <EngineeringIcon name="list-menu" size="1rem" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-10 z-10 w-44 overflow-hidden rounded-lg border border-line bg-surface py-1 text-sm shadow-pop">
              {isAuthor ? (
                <>
                  <button type="button" onClick={() => { setMenuOpen(false); onEdit?.(post); }} className="block w-full px-3 py-2 text-left font-semibold text-ink-secondary hover:bg-surface-muted">Edit</button>
                  <button type="button" onClick={loadAnalytics} className="block w-full px-3 py-2 text-left font-semibold text-ink-secondary hover:bg-surface-muted">Analytics</button>
                  <button type="button" onClick={remove} className="block w-full px-3 py-2 text-left font-semibold text-danger hover:bg-danger/10">Delete</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={follow} className="block w-full px-3 py-2 text-left font-semibold text-ink-secondary hover:bg-surface-muted">{following ? 'Unfollow maker' : 'Follow maker'}</button>
                  <button type="button" onClick={hide} className="block w-full px-3 py-2 text-left font-semibold text-ink-secondary hover:bg-surface-muted">Hide post</button>
                  <button type="button" onClick={report} className="block w-full px-3 py-2 text-left font-semibold text-danger hover:bg-danger/10">Report</button>
                </>
              )}
            </div>
          ) : null}
          </div>
        </div>
      </header>

      <div className="mt-4 space-y-3">
        <h2 className="break-words text-xl font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{post.title}</h2>
        {post.body ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink-secondary [overflow-wrap:anywhere]">{post.body}</p> : null}

        {lookingFor.length ? (
          <div className="flex flex-wrap gap-1.5">
            {lookingFor.map((item) => (
              <span key={item} className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                {item}
              </span>
            ))}
          </div>
        ) : null}

        <MediaGrid media={post.media || []} />
        <LinkPreview preview={linkPreview} />
        <ProjectMiniCard post={post} onProjectClick={projectClick} />
      </div>

      {analyticsOpen ? (
        <div className="mt-4 grid gap-2 rounded-lg border border-line bg-surface-page p-3 text-xs sm:grid-cols-4">
          {analytics ? (
            <>
              <div><span className="block text-ink-muted">Qualified</span><strong className="font-mono text-ink">{formatCount(analytics.qualified_interactions)}</strong></div>
              <div><span className="block text-ink-muted">Project clicks</span><strong className="font-mono text-ink">{formatCount(analytics.stats?.project_click_count)}</strong></div>
              <div><span className="block text-ink-muted">Shares</span><strong className="font-mono text-ink">{formatCount(analytics.stats?.share_count)}</strong></div>
              <div><span className="block text-ink-muted">Saves</span><strong className="font-mono text-ink">{formatCount(analytics.stats?.save_count)}</strong></div>
            </>
          ) : (
            <div className="col-span-full skeleton-shimmer h-10 rounded" />
          )}
        </div>
      ) : null}

      <footer className="mt-4 border-t border-line pt-3">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          <button
            type="button"
            onClick={toggleLike}
            className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors hover:bg-surface-muted', liked ? 'text-danger' : 'text-ink-muted')}
          >
            <EngineeringIcon name="target" size="0.95rem" />
            Useful {formatCount(likeCount)}
          </button>
          <button
            type="button"
            onClick={() => setCommentsOpen((current) => !current)}
            disabled={post.allow_comments === false}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-muted disabled:opacity-50"
          >
            <EngineeringIcon name="message" size="0.95rem" />
            Comment {formatCount(commentCount)}
          </button>
          <button
            type="button"
            onClick={toggleSave}
            className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors hover:bg-surface-muted', saved ? 'text-accent-text' : 'text-ink-muted')}
          >
            <EngineeringIcon name="pin" size="0.95rem" />
            Save {formatCount(saveCount)}
          </button>
          <button
            type="button"
            onClick={share}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-muted"
          >
            <EngineeringIcon name="link" size="0.95rem" />
            Share
          </button>
        </div>
      </footer>

      <Discussion post={post} user={user} open={commentsOpen} onCountChange={setCommentDelta} />
    </article>
  );
}
