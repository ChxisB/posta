import { Elysia } from 'elysia';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Serves the public JWKS endpoint for webhook signature verification.
 */
export const wellKnownRoutes = new Elysia()

  .get('/.well-known/jwks.json', async (c: any) => {
    const signingKeyPath = 'config/posta/signing.key';
    if (!existsSync(signingKeyPath)) {
      c.set.status = 404;
      return { error: 'No signing key configured' };
    }
    try {
      const keyPem = readFileSync(signingKeyPath, 'utf-8');
      const { Signer } = await import('@posta/core');
      const signer = new Signer(keyPem);
      const jwk = await signer.getJwk();
      c.set.headers = { 'Content-Type': 'application/json' };
      c.set.status = 200;
      return { keys: [{ ...jwk, use: 'sig', alg: 'RS256' }] };
    } catch (err: any) {
      c.set.status = 500;
      return { error: err.message };
    }
  }, { detail: { tags: ['Well-Known'], summary: 'JWKS public key endpoint', hide: true } });
