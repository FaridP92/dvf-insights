/**
 * Authentification des webhooks n8n. Deux modes acceptés :
 *  1. `x-signature` : hex(HMAC-SHA256(secret, corps brut)), le plus robuste (anti-rejeu par contenu)
 *  2. `x-webhook-secret` : le secret partagé en clair dans l'en-tête, suffisant en HTTPS et
 *     natif dans n8n (credential "Header Auth")
 * Les deux comparaisons sont en temps constant.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyWebhook(rawBody: string, headers: Headers, secret: string): Promise<boolean> {
  const signature = headers.get('x-signature');
  if (signature) return constantTimeEqual(await hmacHex(secret, rawBody), signature);
  const shared = headers.get('x-webhook-secret');
  return shared !== null && constantTimeEqual(shared, secret);
}

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
