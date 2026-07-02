const pulse = 'animate-pulse motion-reduce:animate-none';

export function SkeletonBlock({ className = '', lightOnly = false }) {
  return (
    <div
      aria-hidden="true"
      className={`${pulse} ${lightOnly ? 'bg-gray-200/80' : 'bg-gray-200/80 dark:bg-gray-800'} ${className}`}
    />
  );
}

function LoadingRegion({ label, className = '', children }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className={className}>
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function RouteSkeleton() {
  return (
    <LoadingRegion label="Loading page" className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 flex items-center gap-4">
        <SkeletonBlock className="h-8 w-8 rounded-lg" />
        <SkeletonBlock className="h-5 w-36 rounded" />
      </div>
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <div className="space-y-3">
          <SkeletonBlock className="h-8 w-64 max-w-full rounded" />
          <SkeletonBlock className="h-4 w-96 max-w-full rounded" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map(item => <SkeletonBlock key={item} className="h-48 rounded-xl" />)}
        </div>
      </div>
    </LoadingRegion>
  );
}

export function DashboardShellSkeleton() {
  return (
    <LoadingRegion label="Loading dashboard" className="dashboard-root app-surface min-h-screen bg-surface-page flex">
      <aside className="hidden lg:block w-60 min-h-screen border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <SkeletonBlock className="h-8 w-36 rounded mb-10" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map(item => <SkeletonBlock key={item} className="h-10 rounded-lg" />)}
        </div>
      </aside>
      <main className="flex-1 p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="space-y-3">
            <SkeletonBlock className="h-8 w-56 rounded" />
            <SkeletonBlock className="h-4 w-80 max-w-full rounded" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map(item => <SkeletonBlock key={item} className="h-24 rounded-xl" />)}
          </div>
          <div className="space-y-3">
            {[0, 1, 2].map(item => <SkeletonBlock key={item} className="h-24 rounded-xl" />)}
          </div>
        </div>
      </main>
    </LoadingRegion>
  );
}

export function EditorSkeleton() {
  return (
    <LoadingRegion label="Loading project editor" className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 flex items-center gap-4">
        <SkeletonBlock className="h-4 w-24 rounded" />
        <SkeletonBlock className="h-7 flex-1 max-w-lg rounded" />
        <SkeletonBlock className="h-9 w-28 rounded-lg" />
      </div>
      <div className="max-w-6xl mx-auto p-6 grid lg:grid-cols-[1fr_18rem] gap-6">
        <div className="space-y-5">
          <SkeletonBlock className="aspect-[16/7] rounded-xl" />
          <SkeletonBlock className="h-40 rounded-xl" />
          <SkeletonBlock className="h-28 rounded-xl" />
        </div>
        <div className="space-y-4">
          <SkeletonBlock className="h-12 rounded-xl" />
          <SkeletonBlock className="h-64 rounded-xl" />
        </div>
      </div>
    </LoadingRegion>
  );
}

export function MediaGridSkeleton({ count = 6, compact = false }) {
  return (
    <LoadingRegion label="Loading media" className={`grid grid-cols-2 ${compact ? '' : 'sm:grid-cols-3 lg:grid-cols-4'} gap-3`}>
      {Array.from({ length: count }, (_, item) => (
        <SkeletonBlock key={item} className="aspect-square rounded-xl" />
      ))}
    </LoadingRegion>
  );
}

export function PublicPortfolioSkeleton() {
  return (
    <LoadingRegion label="Loading portfolio" className="min-h-screen bg-white text-gray-900">
      <div className="h-14 border-b border-gray-100 px-6 flex items-center justify-between">
        <SkeletonBlock lightOnly className="h-5 w-32 rounded" />
        <SkeletonBlock lightOnly className="h-8 w-20 rounded-lg" />
      </div>
      <div className="max-w-5xl mx-auto px-6 py-14 space-y-14">
        <div className="flex flex-col sm:flex-row gap-6">
          <SkeletonBlock lightOnly className="w-24 h-24 rounded-xl flex-none" />
          <div className="flex-1 space-y-3 pt-1">
            <SkeletonBlock lightOnly className="h-9 w-72 max-w-full rounded" />
            <SkeletonBlock lightOnly className="h-5 w-96 max-w-full rounded" />
            <SkeletonBlock lightOnly className="h-4 w-full max-w-2xl rounded" />
            <SkeletonBlock lightOnly className="h-4 w-4/5 max-w-xl rounded" />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map(item => (
            <div key={item} className="border border-gray-100 rounded-xl overflow-hidden">
              <SkeletonBlock lightOnly className="aspect-[16/8]" />
              <div className="p-5 space-y-3">
                <SkeletonBlock lightOnly className="h-6 w-2/3 rounded" />
                <SkeletonBlock lightOnly className="h-4 w-full rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

export function PublicProjectSkeleton() {
  return (
    <LoadingRegion label="Loading project" className="min-h-screen bg-white text-gray-900">
      <div className="h-14 border-b border-gray-100 px-6 flex items-center justify-between">
        <SkeletonBlock lightOnly className="h-5 w-36 rounded" />
        <SkeletonBlock lightOnly className="h-5 w-24 rounded" />
      </div>
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-4">
          <SkeletonBlock lightOnly className="h-10 w-3/4 rounded" />
          <SkeletonBlock lightOnly className="h-5 w-1/2 rounded" />
        </div>
        <SkeletonBlock lightOnly className="aspect-[16/8] rounded-xl" />
        <div className="space-y-4">
          <SkeletonBlock lightOnly className="h-5 w-full rounded" />
          <SkeletonBlock lightOnly className="h-5 w-11/12 rounded" />
          <SkeletonBlock lightOnly className="h-36 w-full rounded-xl" />
        </div>
      </div>
    </LoadingRegion>
  );
}

export function PublicTeamSkeleton() {
  return (
    <LoadingRegion label="Loading team portfolio" className="min-h-screen bg-white text-gray-900">
      <div className="h-14 border-b border-gray-100 px-6 flex items-center">
        <SkeletonBlock lightOnly className="h-5 w-32 rounded" />
      </div>
      <div className="max-w-5xl mx-auto px-6 py-14 space-y-12">
        <div className="flex gap-5">
          <SkeletonBlock lightOnly className="h-20 w-20 rounded-xl flex-none" />
          <div className="flex-1 space-y-3">
            <SkeletonBlock lightOnly className="h-9 w-64 max-w-full rounded" />
            <SkeletonBlock lightOnly className="h-4 w-full max-w-xl rounded" />
            <SkeletonBlock lightOnly className="h-9 w-72 max-w-full rounded-full" />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map(item => <SkeletonBlock lightOnly key={item} className="h-72 rounded-xl" />)}
        </div>
      </div>
    </LoadingRegion>
  );
}
