// Decides what a route guard should do with the current auth state.
//
// Split out from the guards themselves because the interesting case is easy to
// get wrong: there is a window where Supabase has established a session but the
// application profile from GET /auth/me has not arrived yet. `user` is null then,
// even though the visitor is authenticated. A guard that only looks at `user`
// treats that window as signed-out and redirects to /login — and because the
// profile lands a moment later, the public-only guard immediately redirects back.
// The visible result is a flash of the login page after every OAuth return.
//
//   'pending'       -> render a skeleton, decide nothing yet
//   'authenticated' -> the profile is loaded
//   'anonymous'     -> genuinely signed out
export const authGateState = ({ loading, session, user }) => {
  if (loading) return 'pending';
  if (user) return 'authenticated';
  if (session) return 'pending';
  return 'anonymous';
};

export default authGateState;
