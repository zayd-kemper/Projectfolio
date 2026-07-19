import EngineeringIcon from './EngineeringIcon';
import { cx, formatCount } from './format';

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
      {url ? <img loading="lazy" decoding="async" src={url} alt="" className="h-full w-full object-cover" /> : (name || '?').charAt(0)}
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

export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      {icon ? <EngineeringIcon name={icon} size="3rem" className="mx-auto" /> : null}
      <h2 className="mt-4 text-lg font-semibold text-ink">{title}</h2>
      {body ? <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
