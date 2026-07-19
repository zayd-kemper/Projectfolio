import { Link } from 'react-router-dom';
import api from '../../utils/api';
import EngineeringIcon from '../shared/EngineeringIcon';
import { PortfolioCard } from './DiscoverPrimitives';
import { CONTEXTS, cx, formatCount } from './discoverConfig';

function RailSection({ title, action, children }) {
  return (
    <section className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold text-ink-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LeftRail({
  user,
  categories,
  activeCategory,
  drafts,
  onCategory,
  onEditDraft,
  onCreate,
}) {
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-20 text-sm">
        {user ? (
          <button
            type="button"
            onClick={onCreate}
            className="mb-4 flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-ink-secondary transition-colors hover:border-accent-border hover:text-accent-text"
          >
            <EngineeringIcon name="document-edit" size="1rem" />
            New post
          </button>
        ) : null}

        <RailSection title="Project areas">
          <div className="space-y-1">
            {categories.slice(0, 8).map((category) => (
              <button
                key={category.project_type}
                type="button"
                onClick={() => onCategory(activeCategory === category.project_type ? '' : category.project_type)}
                className={cx(
                  'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors',
                  activeCategory === category.project_type
                    ? 'bg-accent-surface text-accent-text'
                    : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                )}
              >
                <span className="truncate">{category.project_type}</span>
                <span className="font-mono text-xs text-ink-muted">{formatCount(category.count)}</span>
              </button>
            ))}
            {!categories.length ? <p className="text-xs text-ink-muted">Categories appear once makers attach projects.</p> : null}
          </div>
        </RailSection>

        {user ? (
          <RailSection
            title="Drafts"
            action={
              <button type="button" onClick={onCreate} className="text-xs font-semibold text-accent-text">New</button>
            }
          >
            <div className="space-y-2">
              {drafts?.length ? drafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => onEditDraft(draft)}
                  className="w-full rounded-lg border border-line p-2 text-left transition-colors hover:border-accent-border"
                >
                  <span className="line-clamp-1 text-xs font-semibold text-ink">{draft.title}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-muted">
                    <EngineeringIcon name="document" size="0.8rem" />
                    Draft
                  </span>
                </button>
              )) : (
                <p className="text-xs leading-relaxed text-ink-muted">Saved drafts will appear here before they are published.</p>
              )}
            </div>
          </RailSection>
        ) : null}
      </div>
    </aside>
  );
}

export function RightRail({ user, insights, interests, onInterests, onFollowChange }) {
  const toggleInterest = (context) => {
    if (!user) return;
    const current = new Set(interests.contexts || []);
    if (current.has(context)) current.delete(context);
    else current.add(context);
    onInterests({ ...interests, contexts: [...current] });
  };

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20">
        {user ? (
          <RailSection title="Feed preferences">
            <p className="mb-3 text-xs leading-relaxed text-ink-muted">Favor the contexts you actually want to see.</p>
            <div className="flex flex-wrap gap-2">
              {CONTEXTS.slice(0, 7).map((context) => (
                <button
                  key={context.id}
                  type="button"
                  onClick={() => toggleInterest(context.id)}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    interests.contexts?.includes(context.id)
                      ? 'border-accent bg-accent text-white'
                      : 'border-line text-ink-muted hover:border-accent-border hover:text-ink'
                  )}
                >
                  <EngineeringIcon name={context.icon} size="0.85rem" className={interests.contexts?.includes(context.id) ? 'brightness-0 invert' : ''} />
                  {context.label}
                </button>
              ))}
            </div>
          </RailSection>
        ) : (
          <section className="rounded-xl border border-accent-border bg-accent-surface p-4">
            <EngineeringIcon name="launch-vector" size="1.7rem" />
            <h2 className="mt-3 text-sm font-semibold text-ink">Build your public signal</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">Post project updates, collect feedback, and help others find your portfolio.</p>
            <Link to="/register" className="mt-3 inline-flex rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-hover">
              Join ProjectFolio
            </Link>
          </section>
        )}

        <RailSection title="Who to follow">
          <p className="mb-3 text-xs leading-relaxed text-ink-muted">Makers with recent public project activity.</p>
          <div className="space-y-2">
            {insights?.recommended_makers?.length ? insights.recommended_makers.map((maker) => (
              <PortfolioCard
                key={maker.id}
                portfolio={maker}
                user={user}
                compact
                onFollowChange={onFollowChange}
              />
            )) : <p className="text-xs text-ink-muted">Recommendations appear after public portfolios have project activity.</p>}
          </div>
        </RailSection>
      </div>
    </aside>
  );
}

export async function followPortfolio(portfolio, currentlyFollowing) {
  const response = currentlyFollowing
    ? await api.delete(`/discover/users/${portfolio.id}/follow`)
    : await api.post(`/discover/users/${portfolio.id}/follow`);
  return response.data;
}
