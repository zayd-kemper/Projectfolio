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

// A second client on the anon key. Redeeming a magic-link token is an ordinary
// user action and must not run on the service-role key.
let anonClient = null;
let anonConfiguredFor = null;

const getSupabaseAnon = () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (anonClient && anonConfiguredFor === `${url}:${anonKey}`) return anonClient;

  const { createClient } = require('@supabase/supabase-js');
  anonClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  anonConfiguredFor = `${url}:${anonKey}`;
  return anonClient;
};

const resetSupabaseAnon = (stub = null) => {
  anonClient = stub;
  anonConfiguredFor = stub
    ? `${process.env.SUPABASE_URL}:${process.env.SUPABASE_ANON_KEY}`
    : null;
};

// supabase-js persists its session under `sb-<project-ref>-auth-token`, where the
// ref is the first hostname label of the project URL. Verified against a live
// browser session: plain JSON, no base64 prefix.
const projectRefFromUrl = (url) => {
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
};

// Mints a real session for `email` so the agent's Puppeteer verifier can load
// authenticated routes as that user.
//
// Why not just navigate a magic link: the SPA client runs flowType: 'pkce', and
// GoTrueClient throws "Not a valid PKCE flow url." for implicit #access_token
// callbacks. Links minted by auth.admin.generateLink carry no code_challenge, so
// they are implicit by construction and the browser will never accept one. The
// link is therefore redeemed here, server-side, and the caller injects the
// resulting session into the page's storage.
//
// Returns null — never throws — when credentials are missing or Supabase
// refuses, so verification degrades to public routes only.
const createVerifierSession = async (email) => {
  if (!email) return null;
  const admin = getSupabaseAdmin();
  const anon = getSupabaseAnon();
  if (!admin || !anon) return null;

  const projectRef = projectRefFromUrl(process.env.SUPABASE_URL);
  if (!projectRef) return null;

  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      logger.warn({ err: error?.message }, 'Could not mint an agent verifier magic link');
      return null;
    }

    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    });
    if (verifyError || !verified?.session) {
      logger.warn({ err: verifyError?.message }, 'Could not redeem the agent verifier magic link');
      return null;
    }

    return { storageKey: `sb-${projectRef}-auth-token`, session: verified.session };
  } catch (error) {
    logger.warn({ err: error.message }, 'Could not create an agent verifier session');
    return null;
  }
};

module.exports = {
  getSupabaseAdmin,
  getSupabaseAnon,
  createVerifierSession,
  resetSupabaseAdmin,
  resetSupabaseAnon,
};
