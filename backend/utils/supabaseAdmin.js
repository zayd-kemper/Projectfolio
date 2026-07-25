// Service-role Supabase client for the few things the backend must do as an admin.
//
// Today that is exactly one thing: minting a short-lived login link so the AI site
// agent's Puppeteer verifier can load the authenticated dashboard/preview routes as
// the user whose portfolio it is checking. This replaces a self-signed JWT that the
// app used to mint and inject into localStorage — Supabase owns sessions now, and
// the SPA only trusts sessions Supabase issued.

const logger = require('./logger');

let client = null;
let configuredFor = null;

const getSupabaseAdmin = () => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  if (client && configuredFor === `${url}:${serviceKey}`) return client;

  const { createClient } = require('@supabase/supabase-js');
  client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  configuredFor = `${url}:${serviceKey}`;
  return client;
};

// Test seam: pass a stub to install it, pass nothing to clear the cached client.
const resetSupabaseAdmin = (stub = null) => {
  client = stub;
  configuredFor = stub
    ? `${process.env.SUPABASE_URL}:${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    : null;
};

// Returns a single-use magic link, or null when admin credentials are unavailable
// or Supabase refuses. Callers degrade to unauthenticated verification on null —
// the same behaviour the old code had when JWT_SECRET was unset.
const createVerifierLoginLink = async (email, redirectTo) => {
  if (!email) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });
    if (error || !data?.properties?.action_link) {
      logger.warn({ err: error?.message }, 'Could not mint an agent verifier login link');
      return null;
    }
    return data.properties.action_link;
  } catch (error) {
    logger.warn({ err: error.message }, 'Could not mint an agent verifier login link');
    return null;
  }
};

module.exports = { getSupabaseAdmin, createVerifierLoginLink, resetSupabaseAdmin };
