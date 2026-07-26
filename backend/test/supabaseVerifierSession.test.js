const test = require('node:test');
const assert = require('node:assert/strict');

const supabaseAdmin = require('../utils/supabaseAdmin');

// Optional calls: the anon seam does not exist until the implementation lands,
// and a throwing hook would mask the assertion this test is actually about.
test.beforeEach(() => {
  process.env.SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  supabaseAdmin.resetSupabaseAdmin?.();
  supabaseAdmin.resetSupabaseAnon?.();
});

const SESSION = {
  access_token: 'at', refresh_token: 'rt', token_type: 'bearer',
  expires_in: 3600, expires_at: 1785080012, user: { id: 'u1' },
};

test('createVerifierSession redeems a magic link into an injectable session', async () => {
  // The SPA runs flowType: 'pkce', which rejects implicit #access_token links, so
  // a server-minted magic link cannot log the browser in by navigation. The link
  // is redeemed server-side instead and the session handed back for injection.
  supabaseAdmin.resetSupabaseAdmin?.({
    auth: {
      admin: {
        generateLink: async () => ({ data: { properties: { hashed_token: 'hashed-123' } }, error: null }),
      },
    },
  });
  supabaseAdmin.resetSupabaseAnon?.({
    auth: { verifyOtp: async () => ({ data: { session: SESSION }, error: null }) },
  });

  const result = await supabaseAdmin.createVerifierSession?.('a@b.com');
  assert.ok(result, 'createVerifierSession must return { storageKey, session }');
  assert.equal(result.storageKey, 'sb-abcdefghijklmnop-auth-token');
  assert.deepEqual(result.session, SESSION);
});

test('createVerifierSession returns null without a service role key', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  supabaseAdmin.resetSupabaseAdmin();
  assert.equal(await supabaseAdmin.createVerifierSession('a@b.com'), null);
});

test('createVerifierSession returns null without an anon key', async () => {
  delete process.env.SUPABASE_ANON_KEY;
  supabaseAdmin.resetSupabaseAnon();
  assert.equal(await supabaseAdmin.createVerifierSession('a@b.com'), null);
});

test('createVerifierSession returns null instead of throwing when generateLink fails', async () => {
  supabaseAdmin.resetSupabaseAdmin({ auth: { admin: { generateLink: async () => ({ data: null, error: new Error('nope') }) } } });
  supabaseAdmin.resetSupabaseAnon({ auth: { verifyOtp: async () => ({ data: { session: SESSION }, error: null }) } });
  assert.equal(await supabaseAdmin.createVerifierSession('a@b.com'), null);
});

test('createVerifierSession returns null when the token cannot be redeemed', async () => {
  supabaseAdmin.resetSupabaseAdmin({ auth: { admin: { generateLink: async () => ({ data: { properties: { hashed_token: 'h' } }, error: null }) } } });
  supabaseAdmin.resetSupabaseAnon({ auth: { verifyOtp: async () => ({ data: null, error: new Error('expired') }) } });
  assert.equal(await supabaseAdmin.createVerifierSession('a@b.com'), null);
});
