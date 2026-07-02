import { Link } from 'react-router-dom';
import EngineeringIcon from '../shared/EngineeringIcon';
import { CATEGORY_ICON_BY_TYPE, cx, formatCount } from './discoverConfig';

const AVATAR_SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-14 w-14 text-lg',
};

export function Avatar({ url, name, accent = '#2563eb', size = 'md' }) {
  return (
    <span
      className={cx(
        'inline-flex flex-none items-center justify-center overflow-hidden rounded-full font-bold',
        AVATAR_SIZES[size] || AVATAR_SIZES.md
      )}
      style={{ backgroundColor: `${accent}18`, color: accent }}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : (name || '?').charAt(0)}
    </span>
  );
}

export function IconPill({ icon, label, active, onClick, as = 'button', tone = 'default', className = '' }) {
  const Comp = as;
  const styles = tone === 'quiet'
    ? active
      ? 'border-accent-border bg-accent-surface text-accent-text'
      : 'border-transparent bg-transparent text-ink-muted hover:border-line hover:bg-surface hover:text-ink'
    : active
      ? 'border-accent bg-accent text-white'
      : 'border-line bg-surface text-ink-muted hover:border-accent-border hover:text-accent-text';
  return (
    <Comp
      type={as === 'button' ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
        styles,
        className
      )}
    >
      <EngineeringIcon name={icon} size="1rem" className={active && tone === 'default' ? 'brightness-0 invert' : ''} />
      <span>{label}</span>
    </Comp>
  );
}

export function ProjectMiniCard({ post, onProjectClick }) {
  if (!post?.project_slug) return null;
  const accent = post.accent_color || '#2563eb';
  return (
    <Link
      to={`/${post.author_username}/${post.project_slug}`}
      onClick={onProjectClick}
      className="group flex gap-3 rounded-lg border border-line bg-surface-page/80 p-3 transition-colors hover:border-accent-border hover:bg-surface"
    >
      <div
        className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-md"
        style={{ backgroundColor: `${accent}16` }}
      >
        {post.project_cover ? (
          <img src={post.project_cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <EngineeringIcon name={CATEGORY_ICON_BY_TYPE[post.project_type] || 'project-module'} size="2rem" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-accent-text">
          <EngineeringIcon name="project-module" size="0.9rem" />
          <span className="truncate">{post.project_type || 'Project'}</span>
        </div>
        <div className="truncate text-sm font-semibold text-ink group-hover:text-accent-text">
          {post.project_title}
        </div>
        {post.project_tagline && (
          <p className="mt-0.5 line-clamp-2 break-words text-xs leading-relaxed text-ink-muted [overflow-wrap:anywhere]">
            {post.project_tagline}
          </p>
        )}
        {post.project_technologies?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {post.project_technologies.slice(0, 4).map((tech) => (
              <span
                key={tech}
                className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-muted"
              >
                {tech}
              </span>
            ))}
          </div>
        )}
      </div>
      <EngineeringIcon name="link" size="1rem" className="mt-1 opacity-50 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export function PortfolioCard({ portfolio, rank, user, compact = false, onFollowChange }) {
  const following = Boolean(portfolio.followed_by_viewer ?? portfolio.following);
  const accent = portfolio.accent_color || '#2563eb';
  const isSelf = user?.id === portfolio.id;

  const follow = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (onFollowChange) await onFollowChange(portfolio, following);
  };

  return (
    <Link
      to={`/${portfolio.username}`}
      className={cx(
        'group flex items-start gap-3 rounded-lg border border-line bg-surface p-3 transition-[transform,box-shadow,border-color] duration-200 ease-out-quart hover:-translate-y-0.5 hover:border-accent-border hover:shadow-lift',
        compact && 'p-2.5'
      )}
    >
      {rank ? (
        <span className="mt-1 w-5 flex-none text-center font-mono text-xs font-semibold text-ink-faint">{rank}</span>
      ) : null}
      <Avatar url={portfolio.avatar_url} name={portfolio.full_name} accent={accent} size={compact ? 'sm' : 'md'} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink group-hover:text-accent-text">
          {portfolio.full_name}
        </div>
        <div className="truncate text-xs text-ink-muted">@{portfolio.username}</div>
        {!compact && portfolio.headline ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">{portfolio.headline}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <EngineeringIcon name="project-module" size="0.85rem" />
            {formatCount(portfolio.project_count)}
          </span>
          <span className="inline-flex items-center gap-1">
            <EngineeringIcon name="team-node" size="0.85rem" />
            {formatCount(portfolio.follower_count)}
          </span>
        </div>
      </div>
      {!isSelf && onFollowChange ? (
        <button
          type="button"
          onClick={follow}
          className={cx(
            'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
            following
              ? 'border-line text-ink-muted hover:border-ink-faint'
              : 'border-transparent text-white'
          )}
          style={following ? undefined : { backgroundColor: accent }}
        >
          {following ? 'Following' : 'Follow'}
        </button>
      ) : null}
    </Link>
  );
}

export function Metric({ icon, label, value }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-muted">
        <EngineeringIcon name={icon} size="1rem" />
        <span>{label}</span>
      </div>
      <div className="font-mono text-lg font-semibold text-ink">{formatCount(value)}</div>
    </div>
  );
}
