const test = require('node:test');
const assert = require('node:assert/strict');
const discoverRouter = require('../routes/discover');

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

test('followUser rejects a non-UUID :id with 400 before touching the database', async () => {
  const db = require('../config/database');
  let queried = false;
  db.query = async () => { queried = true; return { rows: [{ follower_count: 1 }] }; };

  const res = makeRes();
  await discoverRouter.handlers.followUser(
    { params: { id: 'not-a-uuid' }, user: { id: '11111111-1111-1111-1111-111111111111' }, get: () => null },
    res,
    (err) => { throw err; },
  );

  assert.equal(res.statusCode, 400);
  assert.equal(queried, false, 'must not run a query for a malformed id');
});

test('unfollowUser rejects a non-UUID :id with 400 before touching the database', async () => {
  const res = makeRes();
  await discoverRouter.handlers.unfollowUser(
    { params: { id: 'not-a-uuid' }, user: { id: '11111111-1111-1111-1111-111111111111' }, get: () => null },
    res,
    (err) => { throw err; },
  );

  assert.equal(res.statusCode, 400);
});
