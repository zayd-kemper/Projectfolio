const test = require('node:test');
const assert = require('node:assert/strict');

const { makeLookup } = require('../utils/safeFetch');

test('pinned lookup supports both scalar and all:true callback shapes (Node >=20 happy-eyeballs)', () => {
  const lookup = makeLookup({ address: '93.184.216.34', family: 4 });

  lookup('example.com', {}, (err, address, family) => {
    assert.equal(err, null);
    assert.equal(address, '93.184.216.34');
    assert.equal(family, 4);
  });

  lookup('example.com', { all: true }, (err, addresses) => {
    assert.equal(err, null);
    assert.deepEqual(addresses, [{ address: '93.184.216.34', family: 4 }]);
  });
});
