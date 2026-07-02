import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import { EmptyState } from '../components/shared/ui';
import DiscoverComposer from '../components/discover/DiscoverComposer';
import DiscoverPostCard from '../components/discover/DiscoverPostCard';
import { Avatar, IconPill, PortfolioCard } from '../components/discover/DiscoverPrimitives';
import { LeftRail, RightRail, followPortfolio } from '../components/discover/DiscoverRails';
import { CONTEXTS, FEED_MODES, POST_TYPES, cx, normalizeFeedMode } from '../components/discover/discoverConfig';

function PostSkeleton() {
  return (
    <div className="card p-5">
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="skeleton-shimmer h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton-shimmer h-3 w-1/3 rounded" />
            <div className="skeleton-shimmer h-2.5 w-1/2 rounded" />
          </div>
        </div>
        <div className="skeleton-shimmer h-5 w-3/4 rounded" />
        <div className="space-y-2">
          <div className="skeleton-shimmer h-3 rounded" />
          <div className="skeleton-shimmer h-3 w-5/6 rounded" />
        </div>
        <div className="skeleton-shimmer h-24 rounded-lg" />
      </div>
    </div>
  );
}

function MobileFilters({ mode, setMode, context, postType, setContext, setPostType }) {
  return (
    <div className="lg:hidden">
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {FEED_MODES.map((item) => (
          <IconPill
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={mode === item.id}
            onClick={() => setMode(item.id)}
            className="whitespace-nowrap"
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={context}
          onChange={(event) => setContext(event.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-secondary"
        >
          <option value="">All contexts</option>
          <option value="show">Show</option>
          <option value="ask">Ask</option>
          <option value="feedback">Feedback</option>
          <option value="launch">Launch</option>
          <option value="resource">Resource</option>
          <option value="collab">Collab</option>
          <option value="research">Research</option>
          <option value="build_log">Build log</option>
        </select>
        <select
          value={postType}
          onChange={(event) => setPostType(event.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-secondary"
        >
          <option value="">All post types</option>
          <option value="update">Updates</option>
          <option value="feedback_request">Feedback</option>
          <option value="question">Questions</option>
          <option value="launch">Launches</option>
          <option value="resource">Resources</option>
          <option value="open_to_collab">Collab</option>
        </select>
      </div>
    </div>
  );
}

function SearchResults({ results, searching, user, onPostHidden, onEditPost, onPostUpdate, onFollowChange }) {
  const portfolios = results?.portfolios || results?.people || [];
  const posts = results?.posts || [];

  if (searching) {
    return <div className="space-y-4">{[1, 2, 3].map((item) => <PostSkeleton key={item} />)}</div>;
  }

  if (!posts.length && !portfolios.length) {
    return (
      <EmptyState
        icon="search-scan"
        title="No matching signal yet"
        body="Try a technology, maker name, project type, or question keyword."
      />
    );
  }

  return (
    <div className="space-y-6">
      {portfolios.length ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink-secondary">Makers</h2>
          <div className="space-y-3">
            {portfolios.map((portfolio) => (
              <PortfolioCard key={portfolio.id} portfolio={portfolio} user={user} onFollowChange={onFollowChange} />
            ))}
          </div>
        </section>
      ) : null}
      {posts.length ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink-secondary">Posts</h2>
          <div className="space-y-4">
            {posts.map((post) => (
              <DiscoverPostCard
                key={post.id}
                post={post}
                user={user}
                onEdit={onEditPost}
                onHidden={onPostHidden}
                onPostUpdate={onPostUpdate}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function DiscoverPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('tab') === 'makers' || searchParams.get('tab') === 'portfolios' ? 'makers' : 'feed';
  const mode = normalizeFeedMode(searchParams.get('mode') || searchParams.get('feed') || 'recommended');
  const context = searchParams.get('context') || '';
  const postType = searchParams.get('post_type') || '';
  const category = searchParams.get('type') || '';
  const sharedPostId = searchParams.get('post') || '';

  const [posts, setPosts] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [categories, setCategories] = useState([]);
  const [insights, setInsights] = useState(null);
  const [interests, setInterests] = useState({ contexts: [], technologies: [], goals: [] });
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  const setParam = useCallback((key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'post') next.delete('post');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const setView = (nextView) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextView);
    next.delete('post');
    setSearchParams(next);
  };

  const setMode = (nextMode) => setParam('mode', nextMode);
  const setContext = (nextContext) => setParam('context', nextContext);
  const setPostType = (nextType) => setParam('post_type', nextType);
  const setCategory = (nextCategory) => setParam('type', nextCategory);
  const resetFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('context');
    next.delete('post_type');
    next.delete('type');
    next.delete('post');
    setSearchParams(next);
  };

  const loadMeta = useCallback(async () => {
    const [categoryResult, insightResult] = await Promise.all([
      api.get('/discover/categories').catch(() => ({ data: { categories: [] } })),
      api.get('/discover/insights').catch(() => ({ data: null })),
    ]);
    setCategories(categoryResult.data.categories || []);
    setInsights(insightResult.data || null);
  }, []);

  const loadUserData = useCallback(async () => {
    if (!user) {
      setDrafts([]);
      setInterests({ contexts: [], technologies: [], goals: [] });
      return;
    }
    const [draftResult, interestResult] = await Promise.all([
      api.get('/discover/drafts').catch(() => ({ data: { drafts: [] } })),
      api.get('/discover/interests').catch(() => ({ data: { interests: { contexts: [], technologies: [], goals: [] } } })),
    ]);
    setDrafts(draftResult.data.drafts || []);
    setInterests(interestResult.data.interests || { contexts: [], technologies: [], goals: [] });
  }, [user]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const loadFeed = useCallback(async ({ append = false, nextCursor = null } = {}) => {
    setError('');
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      if (view === 'makers') {
        const params = new URLSearchParams();
        if (nextCursor) params.set('cursor', nextCursor);
        const response = await api.get(`/discover/portfolios?${params.toString()}`);
        setPortfolios((current) => append ? [...current, ...(response.data.portfolios || [])] : (response.data.portfolios || []));
        setHasMore(Boolean(response.data.has_more));
        setCursor(response.data.next_cursor || null);
        return;
      }

      const params = new URLSearchParams();
      params.set('mode', mode);
      if (category) params.set('type', category);
      if (context) params.set('context', context);
      if (postType) params.set('post_type', postType);
      if (nextCursor) params.set('cursor', nextCursor);
      const response = await api.get(`/discover/feed?${params.toString()}`);
      let nextPosts = response.data.posts || [];

      if (!append && sharedPostId) {
        const pinned = await api.get(`/discover/posts/${sharedPostId}`).then((r) => r.data.post).catch(() => null);
        if (pinned && !nextPosts.some((post) => post.id === pinned.id)) nextPosts = [pinned, ...nextPosts];
      }

      setPosts((current) => append ? [...current, ...nextPosts] : nextPosts);
      setHasMore(Boolean(response.data.has_more));
      setCursor(response.data.next_cursor || null);
    } catch (loadError) {
      setError(loadError.response?.data?.error || 'Could not load Discover.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [view, mode, category, context, postType, sharedPostId]);

  useEffect(() => {
    setPosts([]);
    setPortfolios([]);
    setCursor(null);
    setHasMore(false);
    loadFeed({ append: false });
  }, [loadFeed]);

  const loadMore = () => {
    if (!hasMore || loadingMore || !cursor) return;
    loadFeed({ append: true, nextCursor: cursor });
  };

  const openComposer = (post = null) => {
    if (!user) {
      toast.error('Sign in to post on Discover.');
      return;
    }
    setEditingPost(post);
    setComposerOpen(true);
    api.post('/discover/events', { event_type: 'open_create_composer', metadata: { mode } }).catch(() => {});
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setEditingPost(null);
  };

  const onCreated = (post) => {
    if (post?.status === 'published') setPosts((current) => [post, ...current]);
    loadUserData();
    loadMeta();
  };

  const onUpdated = (post) => {
    setPosts((current) => {
      if (post.status !== 'published') return current.filter((item) => item.id !== post.id);
      return current.some((item) => item.id === post.id)
        ? current.map((item) => item.id === post.id ? post : item)
        : [post, ...current];
    });
    loadUserData();
    loadMeta();
  };

  const removePost = (id) => setPosts((current) => current.filter((post) => post.id !== id));
  const updatePost = (post) => setPosts((current) => current.map((item) => item.id === post.id ? post : item));

  const updateInterests = async (next) => {
    setInterests(next);
    try {
      await api.put('/discover/interests', next);
    } catch {
      toast.error('Could not save feed preferences.');
    }
  };

  const onFollowChange = async (portfolio, currentlyFollowing) => {
    if (!user) {
      toast.error('Sign in to follow makers.');
      return;
    }
    try {
      const response = await followPortfolio(portfolio, currentlyFollowing);
      const apply = (item) => item.id === portfolio.id
        ? {
          ...item,
          following: response.following,
          followed_by_viewer: response.following,
          follower_count: response.follower_count ?? item.follower_count,
        }
        : item;
      setPortfolios((current) => current.map(apply));
      setInsights((current) => current ? {
        ...current,
        recommended_makers: (current.recommended_makers || []).map(apply),
      } : current);
    } catch {
      toast.error('Could not update follow.');
    }
  };

  const handleSearch = (value) => {
    setSearchQuery(value);
    setSearchResults(null);
    window.clearTimeout(searchTimer.current);
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = window.setTimeout(async () => {
      try {
        const response = await api.get(`/discover/search?q=${encodeURIComponent(trimmed)}`);
        setSearchResults(response.data);
      } catch {
        setSearchResults({ posts: [], portfolios: [] });
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  const activeFilterLabels = [
    context && CONTEXTS.find((item) => item.id === context)?.label,
    postType && POST_TYPES.find((item) => item.id === postType)?.label,
    category,
  ].filter(Boolean);

  return (
    <div className="app-surface min-h-screen bg-surface-page text-ink">
      <DiscoverComposer
        open={composerOpen}
        user={user}
        initialPost={editingPost}
        onClose={closeComposer}
        onCreated={onCreated}
        onUpdated={onUpdated}
      />

      <nav className="sticky top-0 z-30 border-b border-line bg-surface-rail/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1380px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to={user ? '/dashboard' : '/'} className="flex flex-none items-center gap-2">
            <EngineeringIcon name="brand-projectfolio" size="1.8rem" />
            <span className="hidden text-lg font-semibold sm:block">ProjectFolio</span>
          </Link>

          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 flex h-4 w-4 -translate-y-1/2 opacity-60">
              <EngineeringIcon name="search-scan" size="1rem" />
            </span>
            <input
              value={searchQuery}
              onChange={(event) => handleSearch(event.target.value)}
              aria-label="Search makers, posts, and technologies"
              placeholder="Search Discover"
              className="w-full rounded-lg border border-line bg-surface-page py-2 pl-10 pr-9 text-sm text-ink outline-none transition-colors focus:border-accent"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => handleSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-faint hover:text-ink-secondary"
                aria-label="Clear search"
              >
                <EngineeringIcon name="signal-error" size="0.9rem" />
              </button>
            ) : null}
          </div>

          {user ? (
            <>
              <button type="button" onClick={() => openComposer()} className="hidden items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover sm:inline-flex">
                <EngineeringIcon name="document-edit" size="1rem" className="brightness-0 invert" />
                Post
              </button>
              <Link to="/dashboard" className="hidden rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:border-ink-faint md:inline-flex">
                Dashboard
              </Link>
              <Avatar url={user.avatar_url} name={user.full_name} size="sm" />
            </>
          ) : (
            <>
              <Link to="/login" className="hidden text-sm font-semibold text-ink-muted hover:text-ink sm:inline">Sign in</Link>
              <Link to="/register" className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">Join</Link>
            </>
          )}
        </div>
      </nav>

      <main className="mx-auto grid max-w-[1380px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,720px)_288px] lg:justify-center xl:grid-cols-[232px_minmax(0,720px)_288px]">
        <LeftRail
          user={user}
          categories={categories}
          activeCategory={category}
          drafts={drafts}
          onCategory={setCategory}
          onEditDraft={openComposer}
          onCreate={() => openComposer()}
        />

        <section className="min-w-0 space-y-4">
          <h1 className="sr-only">Discover project work</h1>

          {view === 'feed' && user && searchQuery.trim().length < 2 ? (
            <button
              type="button"
              onClick={() => openComposer()}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-out-quart hover:-translate-y-0.5 hover:border-accent-border hover:shadow-lift"
            >
              <Avatar url={user.avatar_url} name={user.full_name} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Share what you are building</span>
                <span className="block truncate text-sm text-ink-muted">Post an update, ask for feedback, or invite collaborators</span>
              </span>
              <EngineeringIcon name="document-edit" size="1.2rem" />
            </button>
          ) : null}

          <div>
            <div className="flex items-center justify-between gap-3 border-b border-line">
              <div className="flex" role="tablist" aria-label="Discover views">
                {[{ id: 'feed', label: 'Feed' }, { id: 'makers', label: 'Makers' }].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={view === tab.id}
                    onClick={() => setView(tab.id)}
                    className={cx(
                      'relative -mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
                      view === tab.id
                        ? 'border-accent text-ink'
                        : 'border-transparent text-ink-muted hover:text-ink'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {view === 'feed' ? (
                <div className="hidden items-center gap-1 lg:flex" aria-label="Sort feed">
                  {FEED_MODES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMode(item.id)}
                      className={cx(
                        'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                        mode === item.id
                          ? 'text-accent-text'
                          : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => openComposer()}
                className="mb-1 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover sm:hidden"
              >
                Post
              </button>
            </div>

            {view === 'feed' ? (
              <div className="mt-3 hidden flex-wrap gap-2 lg:flex">
                {CONTEXTS.map((item) => (
                  <IconPill
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    active={context === item.id}
                    onClick={() => setContext(context === item.id ? '' : item.id)}
                    tone="quiet"
                    className="min-h-8 px-2.5"
                  />
                ))}
              </div>
            ) : null}

            {activeFilterLabels.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-ink-muted">Filtered by</span>
                {activeFilterLabels.map((label, index) => (
                  <span key={`${label}-${index}`} className="rounded-md border border-accent-border bg-accent-surface px-2 py-1 font-semibold text-accent-text">
                    {label}
                  </span>
                ))}
                <button type="button" onClick={resetFilters} className="rounded-md px-2 py-1 font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink">
                  Clear
                </button>
              </div>
            ) : null}

            {view === 'feed' ? (
              <div className="mt-3">
                <MobileFilters
                  mode={mode}
                  setMode={setMode}
                  context={context}
                  postType={postType}
                  setContext={setContext}
                  setPostType={setPostType}
                />
              </div>
            ) : null}
          </div>

          {searchQuery.trim().length >= 2 ? (
            <SearchResults
              results={searchResults}
              searching={searching}
              user={user}
              onEditPost={openComposer}
              onPostHidden={removePost}
              onPostUpdate={updatePost}
              onFollowChange={onFollowChange}
            />
          ) : (
            <>
              {error ? (
                <EmptyState icon="warning-signal" title="Discover could not load" body={error} action={<button type="button" onClick={() => loadFeed()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">Try again</button>} />
              ) : loading ? (
                <div className="space-y-4">{[1, 2, 3].map((item) => <PostSkeleton key={item} />)}</div>
              ) : view === 'makers' ? (
                portfolios.length ? (
                  <div className="space-y-3">
                    {portfolios.map((portfolio, index) => (
                      <PortfolioCard
                        key={portfolio.id}
                        portfolio={portfolio}
                        rank={index + 1}
                        user={user}
                        onFollowChange={onFollowChange}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon="team-node" title="No makers yet" body="Public portfolios with projects will appear here as the network grows." />
                )
              ) : posts.length ? (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <DiscoverPostCard
                      key={post.id}
                      post={post}
                      user={user}
                      onDelete={removePost}
                      onEdit={openComposer}
                      onHidden={removePost}
                      onPostUpdate={updatePost}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={mode === 'trending' ? 'trend-line' : mode === 'latest' ? 'clock' : 'document-edit'}
                  title={mode === 'recommended' ? 'No posts for you yet' : mode === 'trending' ? 'No trending posts yet' : 'No latest posts yet'}
                  body="Try another context, remove a filter, or start the first discussion."
                  action={user ? <button type="button" onClick={() => openComposer()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">Create a post</button> : <Link to="/register" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">Join to post</Link>}
                />
              )}

              {hasMore ? (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="rounded-lg border border-line bg-surface px-5 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:border-accent-border disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <RightRail
          user={user}
          insights={insights}
          interests={interests}
          onInterests={updateInterests}
          onFollowChange={onFollowChange}
        />
      </main>
    </div>
  );
}
