import { isIP } from 'node:net';

const MAX_FORWARDED_LENGTH = 2048;
const MAX_FORWARDED_ADDRESSES = 32;
const INTERNAL_HEADER = 'x-letria-client-ip';

export function trustedProxyHops(value) {
  const normalized = value?.trim() || '0';
  if (!/^[0-5]$/.test(normalized)) {
    throw new Error('LETRIA_TRUST_PROXY_HOPS deve ser um inteiro entre 0 e 5.');
  }
  return Number(normalized);
}

/** Equivalent IPv6 forms and IPv4-mapped addresses share one rate-limit identity. */
export function normalizeClientIp(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  const address = value.trim();
  if (!address || address.includes('%')) return null;
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return null;
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase();
  const mapped = canonical.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

/** Hops are counted from the socket toward the right end of X-Forwarded-For. */
export function sanitizeClientIp(request, hops = 0) {
  delete request.headers['cf-connecting-ip'];
  delete request.headers[INTERNAL_HEADER];
  // Keep the raw view consistent for any other server middleware.
  if (Array.isArray(request.rawHeaders)) {
    const raw = [];
    for (let index = 0; index + 1 < request.rawHeaders.length; index += 2) {
      const name = request.rawHeaders[index].toLowerCase();
      if (name !== 'cf-connecting-ip' && name !== INTERNAL_HEADER) {
        raw.push(request.rawHeaders[index], request.rawHeaders[index + 1]);
      }
    }
    request.rawHeaders = raw;
  }
  let address = normalizeClientIp(request.socket.remoteAddress);
  const forwarded = request.headers['x-forwarded-for'];
  if (address && Number.isInteger(hops) && hops > 0 && hops <= 5 && typeof forwarded === 'string'
    && forwarded.length <= MAX_FORWARDED_LENGTH) {
    const chain = forwarded.split(',');
    if (chain.length >= hops && chain.length <= MAX_FORWARDED_ADDRESSES) {
      // Values to the left of this segment are untrusted client input.
      const trustedSegment = chain.slice(-hops).map(normalizeClientIp);
      if (trustedSegment.every(Boolean)) address = trustedSegment[0];
    }
  }
  if (address) {
    request.headers[INTERNAL_HEADER] = address;
    request.rawHeaders?.push(INTERNAL_HEADER, address);
  }
  return address;
}
