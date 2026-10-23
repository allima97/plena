// Bounds JSON before buffering it and rejects prototype/markup identifiers.
export class RequestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function validId(value, max = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[<>"'`\\\u0000-\u001f\u007f]/.test(value);
}
export function validateObject(value, depth = 0) {
  if (depth > 32) throw new RequestError('Documento muito complexo.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new RequestError('Chave de documento inválida.');
    validateObject(child, depth + 1);
  }
}
export async function readJson(request, limit = 262144) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new RequestError('Documento muito grande.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError('Corpo JSON obrigatório.');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RequestError('Documento muito grande.', 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new RequestError('Corpo JSON inválido.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('O documento deve ser um objeto.');
    validateObject(body);
    return body;
  } finally { reader.releaseLock(); }
}
export function securityHeaders(response, api = false) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Strict-Transport-Security', 'max-age=31536000');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (!headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
  if (api) {
    headers.set('Cache-Control', 'private, no-store, max-age=0');
    headers.set('Pragma', 'no-cache');
    headers.append('Vary', 'Cookie, Cf-Access-Jwt-Assertion');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
