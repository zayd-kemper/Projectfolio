const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) =>
  fs.readFileSync(path.join(__dirname, '..', 'migrations', name), 'utf8');

test('011 lowercases before stripping non-username characters', () => {
  const sql = read('011_supabase_auth_trigger.sql');
  // lower(regexp_replace(x, '[^a-z0-9-]', ...)) deletes uppercase letters first:
  // 'MayaIyer' would become 'ayayer'. The lower() must be on the inside.
  assert.ok(
    /regexp_replace\(\s*lower\(/i.test(sql),
    'username derivation must call regexp_replace(lower(...)), not lower(regexp_replace(...))'
  );
  assert.ok(
    !/lower\(\s*regexp_replace\(/i.test(sql),
    'found lower(regexp_replace(...)) — this strips uppercase letters before folding them'
  );
});

test('011 creates both the provisioning and the email-sync trigger', () => {
  const sql = read('011_supabase_auth_trigger.sql');
  assert.match(sql, /CREATE TRIGGER on_auth_user_created\b/);
  assert.match(sql, /CREATE TRIGGER on_auth_user_email_sync\b/);
  assert.match(sql, /AFTER UPDATE OF email, email_confirmed_at ON auth\.users/);
});

test('011 guards against a null auth email and a null full_name', () => {
  const sql = read('011_supabase_auth_trigger.sql');
  assert.match(sql, /COALESCE\(NEW\.email, ''\)/);
  // public.users.full_name is NOT NULL — a null here 500s every social signup.
  assert.match(sql, /'ProjectFolio user'/);
});

test('011 bounds the username dedup loop', () => {
  const sql = read('011_supabase_auth_trigger.sql');
  assert.ok(
    /WHILE\s+v_try\s*<\s*\d+/i.test(sql),
    'the dedup loop must be bounded, not WHILE EXISTS(...) alone'
  );
});

test('011 is transactional so a privilege failure aborts loudly', () => {
  assert.ok(!/^\s*--\s*no-transaction/im.test(read('011_supabase_auth_trigger.sql')));
});

// ── 012: the import ──────────────────────────────────────────────────────────
const NULL_STRING_COLUMNS = [
  'confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
  'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token',
];

test('012 writes empty strings into every GoTrue NULL-string column', () => {
  const sql = read('012_supabase_auth_import.sql');
  for (const column of NULL_STRING_COLUMNS) {
    assert.ok(
      new RegExp(`\\b${column}\\b`).test(sql),
      `${column} must be listed in the auth.users insert — GoTrue scans it as a non-nullable string and NULL 500s every login`
    );
  }
});

test('012 sets the GoTrue bookkeeping columns', () => {
  const sql = read('012_supabase_auth_import.sql');
  assert.match(sql, /'00000000-0000-0000-0000-000000000000'/); // instance_id
  assert.match(sql, /'authenticated'/);                        // aud + role
});

test('012 never inserts a generated column', () => {
  const sql = read('012_supabase_auth_import.sql');
  const insertTargets = sql.match(/INSERT INTO auth\.\w+\s*\(([\s\S]*?)\)/g) || [];
  assert.ok(insertTargets.length >= 2, 'expected inserts into auth.users and auth.identities');
  for (const block of insertTargets) {
    assert.ok(!/\bconfirmed_at\b/.test(block), 'auth.users.confirmed_at is GENERATED ALWAYS');
    assert.ok(!/\bemail\s*,/.test(block.replace(/email_\w+/g, '')) || !/auth\.identities/.test(block),
      'auth.identities.email is GENERATED ALWAYS');
  }
});

test('012 confirms every imported account', () => {
  const sql = read('012_supabase_auth_import.sql');
  assert.match(sql, /email_confirmed_at/);
  assert.ok(
    !/is_email_verified\s+THEN/i.test(sql),
    'imported accounts must be confirmed unconditionally — only 2 of 79 have is_email_verified'
  );
});

test('012 uses linkedin_oidc, not linkedin, as the provider slug', () => {
  const sql = read('012_supabase_auth_import.sql');
  assert.match(sql, /'linkedin_oidc'/);
  assert.ok(!/'linkedin'/.test(sql), "Supabase's LinkedIn provider slug is linkedin_oidc");
});

test('012 adds the auth.users foreign key as its verification step', () => {
  const sql = read('012_supabase_auth_import.sql');
  assert.match(sql, /REFERENCES auth\.users\s*\(\s*id\s*\)\s*ON DELETE CASCADE/i);
});

test('012 is idempotent and transactional', () => {
  const sql = read('012_supabase_auth_import.sql');
  assert.ok(!/^\s*--\s*no-transaction/im.test(sql));
  assert.ok((sql.match(/NOT EXISTS/gi) || []).length >= 3, 'each insert must be re-runnable');
});
