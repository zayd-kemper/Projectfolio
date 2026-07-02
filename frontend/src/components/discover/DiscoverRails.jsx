import { Link } from 'react-router-dom';
import api from '../../utils/api';
import EngineeringIcon from '../shared/EngineeringIcon';
import { IconPill, PortfolioCard } from './DiscoverPrimitives';
import { CONTEXTS, POST_TYPES, cx, formatCount } from './discoverConfig';

function RailSection({ title, action, children }) {
  return (
    <section className="border-t border-gray-200/80 py-4 first:border-t-0 first:pt-0 dark:border-gray-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LeftRail({
  user,
  contexts,
  categories,
  activeContext,
  activeType,
  activeCategory,
  drafts,
  onContext,
  onType,
  onCategory,
  onEditDraft,
  onCreate,
}) {
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-20 rounded-xl border border-gray-200/70 bg-white/60 p-4 text-sm shadow-sm shadow-gray-200/30 dark:border-gray-800 dark:bg-gray-950/60 dark:shadow-none">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-950 dark:text-gray-100">Refine feed</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Narrow by intent, format, or project area.</p>
        </div>

        <RailSection
          title="Context"
          action={(activeContext || activeType || activeCategory) ? (
            <button type="button" onClick={() => { onContext(''); onType(''); onCategory(''); }} className="text-xs font-semibold text-blue-600 dark:text-blue-300">
              Reset
            </button>
          ) : null}
        >
          <div className="flex flex-wrap gap-2">
            {CONTEXTS.map((context) => (
              <IconPill
                key={context.id}
                icon={context.icon}
                label={context.label}
                active={activeContext === context.id}
                onClick={() => onContext(activeContext === context.id ? '' : context.id)}
                tone="quiet"
                className="min-h-8 px-2.5"
              />
            ))}
          </div>
        </RailSection>

        <RailSection title="Post type">
          <div className="flex flex-wrap gap-2">
            {POST_TYPES.map((type) => (
              <IconPill
                key={type.id}
                icon={type.icon}
                label={type.label}
                active={activeType === type.id}
                onClick={() => onType(activeType === type.id ? '' : type.id)}
                tone="quiet"
                className="min-h-8 px-2.5"
              />
            ))}
          </div>
        </RailSection>

        <RailSection title="Project areas">
          <div className="space-y-1">
            {categories.slice(0, 8).map((category) => (
              <button
                key={category.project_type}
                type="button"
                onClick={() => onCategory(activeCategory === category.project_type ? '' : category.project_type)}
                className={cx(
                  'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition-colors',
                  activeCategory === category.project_type
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900'
                )}
              >
                <span className="truncate">{category.project_type}</span>
                <span className="font-mono text-xs text-gray-400">{formatCount(category.count)}</span>
              </button>
            ))}
            {!categories.length ? <p className="text-xs text-gray-500">Categories appear once makers attach projects.</p> : null}
          </div>
        </RailSection>

        {user ? (
          <RailSection
            title="Drafts"
            action={
              <button type="button" onClick={onCreate} className="text-xs font-bold text-blue-600 dark:text-blue-300">New</button>
            }
          >
            <div className="space-y-2">
              {drafts?.length ? drafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => onEditDraft(draft)}
                  className="w-full rounded-lg border border-gray-200 p-2 text-left transition-colors hover:border-blue-200 dark:border-gray-800 dark:hover:border-blue-900"
                >
                  <span className="line-clamp-1 text-xs font-bold text-gray-950 dark:text-gray-100">{draft.title}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-500">
                    <EngineeringIcon name="document" size="0.8rem" />
                    Draft
                  </span>
                </button>
              )) : (
                <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">Saved drafts will appear here before they are published.</p>
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
      <div className="sticky top-20 space-y-4">
        {user ? (
          <section className="rounded-xl border border-gray-200/70 bg-white/70 p-4 shadow-sm shadow-gray-200/30 dark:border-gray-800 dark:bg-gray-950/70 dark:shadow-none">
            <h2 className="mb-1 text-sm font-semibold text-gray-950 dark:text-gray-100">Feed preferences</h2>
            <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Favor the contexts you actually want to see.</p>
            <div className="flex flex-wrap gap-2">
              {CONTEXTS.slice(0, 7).map((context) => (
                <button
                  key={context.id}
                  type="button"
                  onClick={() => toggleInterest(context.id)}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors',
                    interests.contexts?.includes(context.id)
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 text-gray-600 hover:border-blue-200 dark:border-gray-800 dark:text-gray-300'
                  )}
                >
                  <EngineeringIcon name={context.icon} size="0.85rem" className={interests.contexts?.includes(context.id) ? 'brightness-0 invert' : ''} />
                  {context.label}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 shadow-sm shadow-blue-100/60 dark:border-blue-950 dark:bg-blue-950/30 dark:shadow-none">
            <EngineeringIcon name="launch-vector" size="1.7rem" />
            <h2 className="mt-3 text-sm font-bold text-gray-950 dark:text-gray-100">Build your public signal</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">Post project updates, collect feedback, and help others find your portfolio.</p>
            <Link to="/register" className="mt-3 inline-flex rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700">
              Join ProjectFolio
            </Link>
          </section>
        )}

        <section className="rounded-xl border border-gray-200/70 bg-white/70 p-4 shadow-sm shadow-gray-200/30 dark:border-gray-800 dark:bg-gray-950/70 dark:shadow-none">
          <h2 className="mb-3 text-sm font-semibold text-gray-950 dark:text-gray-100">Who to follow</h2>
          <div className="space-y-2">
            {insights?.recommended_makers?.length ? insights.recommended_makers.map((maker) => (
              <PortfolioCard
                key={maker.id}
                portfolio={maker}
                user={user}
                compact
                onFollowChange={onFollowChange}
              />
            )) : <p className="text-xs text-gray-500">Recommendations appear after public portfolios have project activity.</p>}
          </div>
        </section>
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
