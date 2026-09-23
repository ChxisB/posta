import { describe, it, expect, beforeAll } from 'bun:test';
import { useTestDatabase } from './test-db';

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

describe('Credential routes', () => {
  beforeAll(async () => {
    await useTestDatabase('credentials');
  });

  it('creates a credential, then holds and releases it', async () => {
    // The regression: hold was written as a boolean into an integer column, so
    // every credential create failed and a new install had no way to send.
    const mod = await import('../routes/org/servers.routes');
    const baseUrl = 'http://localhost/org/test-org/servers/1/credentials';

    const createRes = await mod.credentialRoutes.handle(
      new Request(baseUrl, json('POST', { type: 'SMTP', name: 'App' })),
    );
    expect(createRes.status).toBe(201);
    const { credential } = await createRes.json() as any;
    expect(credential.key).toBeString();

    const read = async () =>
      (await (await mod.credentialRoutes.handle(new Request(`${baseUrl}/${credential.id}`))).json() as any)
        .credential;
    expect((await read()).hold).toBe(0);

    const holdRes = await mod.credentialRoutes.handle(
      new Request(`${baseUrl}/${credential.id}`, json('PATCH', { hold: true })),
    );
    expect(holdRes.status).toBe(200);
    expect((await read()).hold).toBe(1);

    const releaseRes = await mod.credentialRoutes.handle(
      new Request(`${baseUrl}/${credential.id}`, json('PATCH', { hold: false })),
    );
    expect(releaseRes.status).toBe(200);
    expect((await read()).hold).toBe(0);
  });
});
