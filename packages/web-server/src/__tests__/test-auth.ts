import { createSign, generateKeyPairSync } from 'node:crypto';

// Tokens go through the real clerkAuth middleware. With CLERK_JWT_KEY set,
// @clerk/backend verifies them locally against this key, without calling Clerk.
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
process.env.CLERK_JWT_KEY = publicKey;

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** An Authorization header carrying a signed Clerk-style session token for `userId`. */
export function authHeader(userId: string): { Authorization: string } {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'test' })}.${encode({
    sub: userId,
    azp: 'http://localhost:3000',
    iat: now,
    nbf: now - 5,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  return { Authorization: `Bearer ${unsigned}.${signature}` };
}
