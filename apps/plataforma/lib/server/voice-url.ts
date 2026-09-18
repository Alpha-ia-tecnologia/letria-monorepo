/** The private HTTP exception is configured by the operator, never by a request. */
export function voiceServiceUrl(value: string, allowedHttpOrigin?: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new Error('Invalid voice URL');
  if (url.protocol === 'https:') return url;
  if (url.protocol !== 'http:') throw new Error('Invalid voice protocol');
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return url;
  if (allowedHttpOrigin) {
    const allowed = new URL(allowedHttpOrigin);
    if (allowed.protocol === 'http:' && !allowed.username && !allowed.password &&
      !allowed.search && !allowed.hash && allowed.pathname === '/' && allowed.origin === url.origin) return url;
  }
  throw new Error('Private HTTP voice origin must be explicitly allowed');
}
