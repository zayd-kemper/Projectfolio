const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');

const isPrivateAddress = (address) => {
  if (!address) return true;
  const ipv4Mapped = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (ipv4Mapped) return isPrivateAddress(ipv4Mapped[1]);
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && address !== '192.0.0.9' && address !== '192.0.0.10')
      || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const normalized = address.toLowerCase();
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc')
    || normalized.startsWith('fd') || normalized.startsWith('fe8')
    || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')
    || normalized.startsWith('ff') || normalized === '64:ff9b::' || normalized.startsWith('64:ff9b:1:')
    || normalized.startsWith('2001:db8:') || normalized.startsWith('2002:');
};

const validateTarget = async (rawUrl) => {
  const target = new URL(rawUrl);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Only public HTTP(S) URLs are allowed.');
  if (target.port && !['80', '443'].includes(target.port)) throw new Error('Non-standard ports are not allowed.');
  const addresses = await dns.lookup(target.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('Private network addresses are not allowed.');
  return { target, address: addresses[0] };
};

// Pins DNS to the address that passed the SSRF check. Node >=20 enables
// autoSelectFamily (happy-eyeballs) by default and calls lookup with
// options.all=true expecting an ARRAY callback; the scalar shape there throws
// "Invalid IP address: undefined" and breaks every fetch.
const makeLookup = (address) => (hostname, options, callback) => {
  if (options && options.all) return callback(null, [{ address: address.address, family: address.family }]);
  return callback(null, address.address, address.family);
};

const safeFetchText = async (rawUrl, { maxBytes = 1024 * 1024, timeoutMs = 10000, redirects = 3 } = {}) => {
  const { target, address } = await validateTarget(rawUrl);
  const transport = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(target, {
      method: 'GET',
      headers: { 'User-Agent': 'ProjectFolio/1.0', Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9' },
      lookup: makeLookup(address),
      servername: target.hostname,
    }, async (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirects <= 0) return reject(new Error('Too many redirects.'));
        try {
          return resolve(await safeFetchText(new URL(response.headers.location, target).toString(), { maxBytes, timeoutMs, redirects: redirects - 1 }));
        } catch (error) { return reject(error); }
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) request.destroy(new Error('Remote response is too large.'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve({
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode,
        url: target.toString(),
        text: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Remote request timed out.')));
    request.on('error', reject);
    request.end();
  });
};

module.exports = { isPrivateAddress, validateTarget, safeFetchText, makeLookup };
