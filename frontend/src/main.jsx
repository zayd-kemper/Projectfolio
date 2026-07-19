// frontend/src/main.jsx
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
// import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './hooks/useAuth';
import './styles/globals.css';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { DashboardShellSkeleton, RouteSkeleton } from './components/shared/Skeleton';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from './components/shared/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

// Route chunks
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProjectEditorPage = lazy(() => import('./pages/ProjectEditorPage'));
const PublicPortfolioPage = lazy(() => import('./pages/PublicPortfolioPage'));
const PublicProjectPage = lazy(() => import('./pages/PublicProjectPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const MediaLibraryPage = lazy(() => import('./pages/MediaLibraryPage'));
const OAuthSuccessPage = lazy(() => import('./pages/OAuthSuccessPage'));
const JoinPage = lazy(() => import('./pages/JoinPage'));
const EndorsementPage = lazy(() => import('./pages/EndorsementPage'));
const TeamsPage = lazy(() => import('./pages/TeamsPage'));
const TeamDetailPage = lazy(() => import('./pages/TeamDetailPage'));
const PublicTeamPage = lazy(() => import('./pages/PublicTeamPage'));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'));
const AIToolsPage = lazy(() => import('./pages/AIToolsPage'));
const AdvisorPage = lazy(() => import('./pages/AdvisorPage'));
const PortfolioStudioPage = lazy(() => import('./pages/PortfolioStudioPage'));

// Protected route wrapper
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <DashboardShellSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Public only route (redirect to dashboard if logged in)
function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <RouteSkeleton />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function RouteFallback() {
  return <RouteSkeleton />;
}

function PageTransition({ children }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
      transition={{ duration: reduceMotion ? 0 : 0.10, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

function App() {
  const location = useLocation();
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { borderRadius: '12px', fontSize: '14px', fontFamily: 'DM Sans, sans-serif' },
          success: { iconTheme: { primary: '#2563eb', secondary: '#fff' } },
          // Errors stay long enough to read and act on.
          error: { duration: 6000 },
        }}
      />
      <Suspense fallback={<RouteFallback />}>
        <AnimatePresence mode="wait">
          <ErrorBoundary key={location.pathname}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
            <Route path="/login" element={<PublicOnlyRoute><PageTransition><LoginPage /></PageTransition></PublicOnlyRoute>} />
            <Route path="/register" element={<PublicOnlyRoute><PageTransition><RegisterPage /></PageTransition></PublicOnlyRoute>} />
            <Route path="/join/:token" element={<PageTransition><JoinPage /></PageTransition>} />
            <Route path="/endorse/:token" element={<PageTransition><EndorsementPage /></PageTransition>} />
            <Route path="/dashboard" element={<ProtectedRoute><PageTransition><DashboardPage /></PageTransition></ProtectedRoute>} />
            <Route path="/dashboard/projects/new" element={<ProtectedRoute><PageTransition><ProjectEditorPage /></PageTransition></ProtectedRoute>} />
            <Route path="/dashboard/projects/:id/edit" element={<ProtectedRoute><PageTransition><ProjectEditorPage /></PageTransition></ProtectedRoute>} />
            <Route path="/dashboard/profile" element={<ProtectedRoute><Navigate to="/dashboard/settings?tab=profile" replace /></ProtectedRoute>} />
            <Route path="/dashboard/portfolio-settings" element={<ProtectedRoute><Navigate to="/dashboard/portfolio?mode=controls" replace /></ProtectedRoute>} />
            <Route path="/dashboard/account" element={<ProtectedRoute><Navigate to="/dashboard/settings?tab=account" replace /></ProtectedRoute>} />
            <Route path="/dashboard/settings" element={<ProtectedRoute><PageTransition><SettingsPage /></PageTransition></ProtectedRoute>} />
            <Route path="/dashboard/ai-tools" element={<ProtectedRoute><PageTransition><AIToolsPage /></PageTransition></ProtectedRoute>} />
            <Route path="/dashboard/advisor" element={<ProtectedRoute><PageTransition><AdvisorPage /></PageTransition></ProtectedRoute>} />
            <Route path="/dashboard/portfolio" element={<ProtectedRoute><PageTransition><PortfolioStudioPage /></PageTransition></ProtectedRoute>} />
            <Route path="/dashboard/agent" element={<ProtectedRoute><Navigate to="/dashboard/portfolio?mode=chat" replace /></ProtectedRoute>} />
            <Route path="/dashboard/integrations" element={<ProtectedRoute><PageTransition><IntegrationsPage /></PageTransition></ProtectedRoute>} />
            <Route path="/dashboard/applications" element={<ProtectedRoute><Navigate to="/dashboard/integrations?tab=applications" replace /></ProtectedRoute>} />
            <Route path="/dashboard/analytics" element={<ProtectedRoute><PageTransition><AnalyticsPage /></PageTransition></ProtectedRoute>} />
            <Route path="/dashboard/media" element={<ProtectedRoute><PageTransition><MediaLibraryPage /></PageTransition></ProtectedRoute>} />
            <Route path="/dashboard/teams" element={<ProtectedRoute><PageTransition><TeamsPage /></PageTransition></ProtectedRoute>} />
            <Route path="/dashboard/teams/:id" element={<ProtectedRoute><PageTransition><TeamDetailPage /></PageTransition></ProtectedRoute>} />
            <Route path="/team/:slug" element={<PageTransition><PublicTeamPage /></PageTransition>} />
            <Route path="/discover" element={<PageTransition><DiscoverPage /></PageTransition>} />
            <Route path="/:username" element={<PageTransition><PublicPortfolioPage /></PageTransition>} />
            <Route path="/:username/:projectSlug" element={<PageTransition><PublicProjectPage /></PageTransition>} />
            <Route path="/oauth-success" element={<PageTransition><OAuthSuccessPage /></PageTransition>} />
          </Routes>
          </ErrorBoundary>
        </AnimatePresence>
      </Suspense>
    </>
  );
}

// Apply the persisted theme before first paint so refreshes and deep links
// (e.g. /discover, the editor) render dark without waiting for a layout
// that mounts useDarkMode.
if (localStorage.getItem('darkMode') === 'true') {
  document.documentElement.classList.add('dark');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>  {/* <-- ADDED HERE */}
            <App />
          </TooltipProvider> {/* <-- ADDED HERE */}
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
