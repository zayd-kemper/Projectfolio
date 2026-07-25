const test = require('node:test');
const assert = require('node:assert/strict');

const { createVerifierLoginLink, resetSupabaseAdmin } = require('../utils/supabaseAdmin');

test.beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetSupabaseAdmin();
});

test('createVerifierLoginLink returns null when the service role key is absent', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  assert.equal(await createVerifierLoginLink('a@b.com', 'http://localhost:3000'), null);
});

test('createVerifierLoginLink returns null when the url is absent', async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  assert.equal(await createVerifierLoginLink('a@b.com', 'http://localhost:3000'), null);
});

test('createVerifierLoginLink returns null instead of throwing when generateLink fails', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  resetSupabaseAdmin({
    auth: { admin: { generateLink: async () => ({ data: null, error: new Error('nope') }) } },
  });
  assert.equal(await createVerifierLoginLink('a@b.com', 'http://localhost:3000'), null);
});

test('createVerifierLoginLink returns the action link on success', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  let seen = null;
  resetSupabaseAdmin({
    auth: {
      admin: {
        generateLink: async (options) => {
          seen = options;
          return { data: { properties: { action_link: 'https://example.supabase.co/auth/v1/verify?token=abc' } }, error: null };
        },
      },
    },
  });
  const link = await createVerifierLoginLink('a@b.com', 'http://localhost:3000/auth/callback');
  assert.equal(link, 'https://example.supabase.co/auth/v1/verify?token=abc');
  assert.equal(seen.type, 'magiclink');
  assert.equal(seen.email, 'a@b.com');
  assert.equal(seen.options.redirectTo, 'http://localhost:3000/auth/callback');
});
