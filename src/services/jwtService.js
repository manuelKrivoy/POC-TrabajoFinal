// Utilidades JWT sin dependencias externas.
// Implementa HS256 suficiente para proteger rutas admin de la POC.
import { createHmac, timingSafeEqual } from 'node:crypto';

function base64url(input) {
  // Serializa header/payload al formato base64url requerido por JWT.
  return Buffer.from(input).toString('base64url');
}

function signPart(content, secret) {
  // Firma el contenido header.payload con HMAC SHA-256.
  return createHmac('sha256', secret).update(content).digest('base64url');
}

export function signJwt(payload, secret, expiresInSeconds = 3600) {
  // JWT HS256 minimo para la POC: no requiere dependencias externas y vence por defecto en 1 hora.
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  return `${unsigned}.${signPart(unsigned, secret)}`;
}

export function verifyJwt(token, secret) {
  // Verifica estructura, firma y expiracion antes de permitir rutas admin.
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expected = signPart(unsigned, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
