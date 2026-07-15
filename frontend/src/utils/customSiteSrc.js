// Builds the src URL for the custom-site iframe. Executable author code is served
// from a dedicated sandbox origin (VITE_CUSTOM_SITE_ORIGIN) so it never runs on
// the app's own origin. When unset (dev), the URL stays relative to the app.
export const customSiteSrc = (username, version = '') => {
  const sandboxBase = import.meta.env.VITE_CUSTOM_SITE_ORIGIN || '';
  return `${sandboxBase}/api/portfolio/${encodeURIComponent(username)}/custom-site${version || ''}`;
};
