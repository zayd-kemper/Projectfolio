// Public read routes return a different body to authenticated callers at the same
// URL. Without a Vary header nothing tells a shared cache those are distinct
// responses. Cloudflare happens to bypass cache when Authorization is present, but
// that is a vendor default worth not depending on.
//
// Always use res.vary() rather than res.setHeader('Vary', ...): compression()
// already sets Vary: Accept-Encoding, and setHeader would overwrite it.

const PUBLIC_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
const PRIVATE_CACHE_CONTROL = 'private, no-store';

const setPublicCacheHeaders = (res) => {
  res.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
  res.vary('Authorization');
};

const setPrivateCacheHeaders = (res) => {
  res.setHeader('Cache-Control', PRIVATE_CACHE_CONTROL);
  res.vary('Authorization');
};

module.exports = {
  setPublicCacheHeaders,
  setPrivateCacheHeaders,
  PUBLIC_CACHE_CONTROL,
  PRIVATE_CACHE_CONTROL,
};
