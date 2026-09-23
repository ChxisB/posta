import { describe, it, expect, beforeAll } from 'bun:test';
import { useTestDatabase } from './test-db';

describe('Suppression routes', () => {
  beforeAll(async () => {
    await useTestDatabase('suppressions');
  });

  it('adds, lists and removes a suppression', async () => {
    // The worker suppresses hard-bounced addresses on its own; this API is the
    // only way to see what it added or to lift a suppression made in error.
    const mod = await import('../routes/org/messages.routes');
    const baseUrl = 'http://localhost/org/test-org/servers/1/messages/suppressions';

    const createRes = await mod.messageRoutes.handle(
      new Request(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'recipient', address: 'gone@remote.test', reason: 'Manual' }),
      }),
    );
    expect(createRes.status).toBe(201);
    const { suppression } = await createRes.json() as any;
    expect(suppression.address).toBe('gone@remote.test');

    const listRes = await mod.messageRoutes.handle(new Request(baseUrl));
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    const found = listBody.suppressions.find((s: any) => s.id === suppression.id);
    expect(found).toBeDefined();
    expect(found.reason).toBe('Manual');
    expect(found.timestamp).toBeGreaterThan(0);

    const deleteRes = await mod.messageRoutes.handle(
      new Request(`${baseUrl}/${suppression.id}`, { method: 'DELETE' }),
    );
    expect(deleteRes.status).toBe(200);

    const afterDelete = await (await mod.messageRoutes.handle(new Request(baseUrl))).json() as any;
    expect(afterDelete.suppressions.find((s: any) => s.id === suppression.id)).toBeUndefined();
  });
});
