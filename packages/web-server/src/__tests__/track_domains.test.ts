import { describe, it, expect, beforeAll } from 'bun:test';

describe('Track Domains Routes', () => {
  beforeAll(() => {
    process.env.POSTA_MAIN_DB_PATH = `/tmp/posta-test-td-${Date.now()}.db`;
    process.env.POSTA_MESSAGE_DB_DIRECTORY = `/tmp/posta-test-msg-td-${Date.now()}`;
    process.env.POSTA_CONFIG_FILE_PATH = '/dev/null';
  });

  it('CRUD: creates, lists, updates, toggles, checks, and deletes a track domain', async () => {
    const mod = await import('../routes/org/track_domains.routes');
    const baseUrl = 'http://localhost/org/test-org/servers/1/track_domains';

    // ======== CREATE ========
    const createRes = await mod.trackDomainsRoutes.handle(
      new Request(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'track.example.com', track_clicks: false, excluded_click_domains: 'spam.com' }),
      }),
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json() as any;
    expect(createBody.track_domain).toBeDefined();
    expect(createBody.track_domain.name).toBe('track.example.com');
    expect(createBody.track_domain.track_clicks).toBe(0);
    expect(createBody.track_domain.excluded_click_domains).toBe('spam.com');
    const uuid = createBody.track_domain.uuid;
    expect(uuid).toBeDefined();
    expect(typeof uuid).toBe('string');
    expect(uuid.length).toBeGreaterThan(0);

    // ======== LIST ========
    const listRes = await mod.trackDomainsRoutes.handle(
      new Request(baseUrl, { method: 'GET' }),
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    expect(listBody.track_domains).toBeArray();
    const found = listBody.track_domains.find((d: any) => d.uuid === uuid);
    expect(found).toBeDefined();
    expect(found.name).toBe('track.example.com');

    // ======== CREATE second domain for list ordering test ========
    await mod.trackDomainsRoutes.handle(
      new Request(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'alpha.example.com' }),
      }),
    );
    const listAfterSecond = await mod.trackDomainsRoutes.handle(
      new Request(baseUrl, { method: 'GET' }),
    );
    const listBody2 = await listAfterSecond.json() as any;
    expect(listBody2.track_domains.length).toBeGreaterThanOrEqual(2);
    // Alpha should come first (ORDER BY name)
    expect(listBody2.track_domains[0].name).toBe('alpha.example.com');

    // ======== PATCH (update) ========
    const patchRes = await mod.trackDomainsRoutes.handle(
      new Request(`${baseUrl}/${uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_clicks: true, excluded_click_domains: 'example.org' }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json() as any;
    expect(patchBody.track_domain).toBeDefined();
    expect(patchBody.track_domain.track_clicks).toBe(1);
    expect(patchBody.track_domain.excluded_click_domains).toBe('example.org');

    // ======== PATCH — no-op when no fields provided ========
    const emptyPatchRes = await mod.trackDomainsRoutes.handle(
      new Request(`${baseUrl}/${uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(emptyPatchRes.status).toBe(200);
    const emptyPatchBody = await emptyPatchRes.json() as any;
    expect(emptyPatchBody.track_domain).toBeDefined();
    expect(emptyPatchBody.track_domain.uuid).toBe(uuid);

    // ======== PATCH — 404 for non-existent UUID ========
    const notFoundPatch = await mod.trackDomainsRoutes.handle(
      new Request(`${baseUrl}/nonexistent-uuid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_clicks: false }),
      }),
    );
    expect(notFoundPatch.status).toBe(404);
    const notFoundBody = await notFoundPatch.json() as any;
    expect(notFoundBody.error).toBe('TrackDomainNotFound');

    // ======== TOGGLE SSL ========
    const toggleRes = await mod.trackDomainsRoutes.handle(
      new Request(`${baseUrl}/${uuid}/toggle_ssl`, { method: 'POST' }),
    );
    expect(toggleRes.status).toBe(200);
    const toggleBody = await toggleRes.json() as any;
    // Default ssl_enabled is true (1), flipped to false (0)
    expect(toggleBody.ssl_enabled).toBe(false);

    // Toggle back
    const toggleBackRes = await mod.trackDomainsRoutes.handle(
      new Request(`${baseUrl}/${uuid}/toggle_ssl`, { method: 'POST' }),
    );
    const toggleBackBody = await toggleBackRes.json() as any;
    expect(toggleBackBody.ssl_enabled).toBe(true);

    // ======== TOGGLE SSL — 404 ========
    const toggleNotFound = await mod.trackDomainsRoutes.handle(
      new Request(`${baseUrl}/nonexistent-uuid/toggle_ssl`, { method: 'POST' }),
    );
    expect(toggleNotFound.status).toBe(404);

    // ======== CHECK DNS ========
    const checkRes = await mod.trackDomainsRoutes.handle(
      new Request(`${baseUrl}/${uuid}/check`, { method: 'POST' }),
    );
    expect(checkRes.status).toBe(200);
    const checkBody = await checkRes.json() as any;
    expect(['Missing', 'Error', 'OK']).toContain(checkBody.status);

    // ======== CHECK DNS — 404 ========
    const checkNotFound = await mod.trackDomainsRoutes.handle(
      new Request(`${baseUrl}/nonexistent-uuid/check`, { method: 'POST' }),
    );
    expect(checkNotFound.status).toBe(404);

    // ======== DELETE ========
    const deleteRes = await mod.trackDomainsRoutes.handle(
      new Request(`${baseUrl}/${uuid}`, { method: 'DELETE' }),
    );
    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json() as any;
    expect(deleteBody.deleted).toBe(true);

    // ======== DELETE — 404 for already-deleted UUID ========
    const doubleDeleteRes = await mod.trackDomainsRoutes.handle(
      new Request(`${baseUrl}/${uuid}`, { method: 'DELETE' }),
    );
    expect(doubleDeleteRes.status).toBe(404);
  });
});
