import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import EngineeringIcon from '../components/shared/EngineeringIcon';
import DiscoverComposer from '../components/discover/DiscoverComposer';
import DiscoverPostCard from '../components/discover/DiscoverPostCard';
import { Avatar, IconPill, PortfolioCard } from '../components/discover/DiscoverPrimitives';
import { LeftRail, RightRail, followPortfolio } from '../components/discover/DiscoverRails';
import { CONTEXTS, FEED_MODES, POST_TYPES, cx, formatCount, normalizeFeedMode } from '../components/discover/discoverConfig';

function PostSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm shadow-gray-200/50 dark:border-gray-800 dark:bg-gray-950 dark:shadow-none">
      <div className="animate-pulse space-y-4">
        <div className="flex gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-800" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-2.5 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
          </div>
        </div>
        <div className="h-5 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="space-y-2">
          <div className="h-3 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-3 w-5/6 rounded bg-gray-200 dark:bg-gray-800" />
        </div>
        <div className="h-24 rounded-lg bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}

function EmptyState({ icon, title, body, action }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center shadow-sm shadow-gray-200/40 dark:border-gray-800 dark:bg-gray-950 dark:shadow-none">
      <EngineeringIcon name={icon} size="3rem" className="mx-auto" />
      <h2 className="mt-4 text-lg font-semibold text-gray-950 dark:text-gray-100">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-500 dark:text-gray-400">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
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
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
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
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
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
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Makers</h2>
          <div className="space-y-3">
            {portfolios.map((portfolio) => (
              <PortfolioCard key={portfolio.id} portfolio={portfolio} user={user} onFollowChange={onFollowChange} />
            ))}
          </div>
        </section>
      ) : null}
      {posts.length ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Posts</h2>
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

  const currentMode = FEED_MODES.find((item) => item.id === mode) || FEED_MODES[0];
  const activeFilterLabels = [
    context && CONTEXTS.find((item) => item.id === context)?.label,
    postType && POST_TYPES.find((item) => item.id === postType)?.label,
    category,
  ].filter(Boolean);
  const visibleCount = view === 'makers' ? portfolios.length : posts.length;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-950 dark:bg-gray-950 dark:text-gray-100">
      <DiscoverComposer
        open={composerOpen}
        user={user}
        initialPost={editingPost}
        onClose={closeComposer}
        onCreated={onCreated}
        onUpdated={onUpdated}
      />

      <nav className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
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
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-9 text-sm text-gray-950 outline-none transition-colors focus:border-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => handleSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                aria-label="Clear search"
              >
                <EngineeringIcon name="signal-error" size="0.9rem" />
              </button>
            ) : null}
          </div>

          {user ? (
            <>
              <button type="button" onClick={() => openComposer()} className="hidden items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:inline-flex">
                <EngineeringIcon name="document-edit" size="1rem" className="brightness-0 invert" />
                Post
              </button>
              <Link to="/dashboard" className="hidden rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 transition-colors hover:border-gray-300 dark:border-gray-800 dark:text-gray-200 md:inline-flex">
                Dashboard
              </Link>
              <Avatar url={user.avatar_url} name={user.full_name} size="sm" />
            </>
          ) : (
            <>
              <Link to="/login" className="hidden text-sm font-bold text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white sm:inline">Sign in</Link>
              <Link to="/register" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700">Join</Link>
            </>
          )}
        </div>
      </nav>

      <main className="mx-auto grid max-w-[1380px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,720px)_288px] lg:justify-center xl:grid-cols-[232px_minmax(0,720px)_288px]">
        <LeftRail
          user={user}
          contexts={[]}
          categories={categories}
          activeContext={context}
          activeType={postType}
          activeCategory={category}
          drafts={drafts}
          onContext={setContext}
          onType={setPostType}
          onCategory={setCategory}
          onEditDraft={openComposer}
          onCreate={() => openComposer()}
        />

        <section className="min-w-0 space-y-4">
          <header className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm shadow-gray-200/50 dark:border-gray-800 dark:bg-gray-950 dark:shadow-none">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  <EngineeringIcon name={currentMode.icon} size="0.95rem" />
                  {view === 'makers' ? 'Makers' : currentMode.label}
                </div>
                <h1 className="text-2xl font-semibold text-gray-950 dark:text-gray-100">Discover project work</h1>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  Follow build updates, questions, launches, and makers from the ProjectFolio network.
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
                <button
                  type="button"
                  onClick={() => setView('feed')}
                  className={cx('rounded-md px-3 py-1.5 text-sm font-semibold transition-colors', view === 'feed' ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-100' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100')}
                >
                  Feed
                </button>
                <button
                  type="button"
                  onClick={() => setView('makers')}
                  className={cx('rounded-md px-3 py-1.5 text-sm font-semibold transition-colors', view === 'makers' ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-800 dark:text-gray-100' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100')}
                >
                  Makers
                </button>
                <button
                  type="button"
                  onClick={() => openComposer()}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:hidden"
                >
                  Post
                </button>
              </div>
            </div>

            {view === 'feed' ? (
              <div className="mt-4 hidden items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-800 lg:flex">
                <div className="flex flex-wrap gap-2">
                  {FEED_MODES.map((item) => (
                    <IconPill
                      key={item.id}
                      icon={item.icon}
                      label={item.label}
                      active={mode === item.id}
                      onClick={() => setMode(item.id)}
                    />
                  ))}
                </div>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {loading ? 'Loading activity' : `${formatCount(visibleCount)} ${view === 'makers' ? 'makers' : 'posts'} shown`}
                </div>
              </div>
            ) : null}

            {activeFilterLabels.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-xs dark:border-gray-800">
                <span className="font-semibold text-gray-500 dark:text-gray-400">Filtered by</span>
                {activeFilterLabels.map((label, index) => (
                  <span key={`${label}-${index}`} className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                    {label}
                  </span>
                ))}
                <button type="button" onClick={resetFilters} className="rounded-md px-2 py-1 font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-100">
                  Clear
                </button>
              </div>
            ) : null}

            {view === 'feed' ? (
              <div className="mt-4">
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
          </header>

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
              {view === 'feed' && user ? (
                <button
                  type="button"
                  onClick={() => openComposer()}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm shadow-gray-200/50 transition-colors hover:border-blue-200 hover:bg-blue-50/30 dark:border-gray-800 dark:bg-gray-950 dark:shadow-none dark:hover:border-blue-900 dark:hover:bg-blue-950/20"
                >
                  <Avatar url={user.avatar_url} name={user.full_name} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-950 dark:text-gray-100">Share what you are building</span>
                    <span className="block truncate text-sm text-gray-500 dark:text-gray-400">Post an update, ask for feedback, or invite collaborators</span>
                  </span>
                  <EngineeringIcon name="document-edit" size="1.2rem" />
                </button>
              ) : null}

              {error ? (
                <EmptyState icon="warning-signal" title="Discover could not load" body={error} action={<button type="button" onClick={() => loadFeed()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">Try again</button>} />
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
                  action={user ? <button type="button" onClick={() => openComposer()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">Create a post</button> : <Link to="/register" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">Join to post</Link>}
                />
              )}

              {hasMore ? (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-700 transition-colors hover:border-blue-200 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
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
