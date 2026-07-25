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
