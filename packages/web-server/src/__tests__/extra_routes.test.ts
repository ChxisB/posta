import { describe, it, expect, beforeAll } from 'bun:test';
import { Elysia } from 'elysia';
import { app } from '../index';
import { serverRoutes } from '../routes/org/servers.routes';

const testServerApp = new Elysia().use(serverRoutes);

describe('GET /ip', () => {
  it('returns an IP address', async () => {
    const res = await app.handle(
      new Request('http://localhost/ip', { method: 'GET' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('ip');
    expect(typeof body.ip).toBe('string');
  });
});

describe('Help routes', () => {
  beforeAll(() => {
    process.env.POSTA_MAIN_DB_PATH = `/tmp/posta-test-extra-${Date.now()}.db`;
    process.env.POSTA_MESSAGE_DB_DIRECTORY = `/tmp/posta-test-msg-extra-${Date.now()}`;
    process.env.POSTA_CONFIG_FILE_PATH = '/dev/null';
  });

  it('GET /:serverId/help/outgoing returns 200 with credentials array', async () => {
    const res = await testServerApp.handle(
      new Request('http://localhost/org/test-org/servers/1/help/outgoing', { method: 'GET' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('credentials');
    expect(typeof body.credentials).toBe('object');
    expect(Array.isArray(body.credentials)).toBe(false);
  });

  it('GET /:serverId/help/incoming returns 200 with routes array', async () => {
    const res = await testServerApp.handle(
      new Request('http://localhost/org/test-org/servers/1/help/incoming', { method: 'GET' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('routes');
    expect(Array.isArray(body.routes)).toBe(true);
  });

  it('GET /:serverId/advanced returns 200 with advanced settings', async () => {
    const res = await testServerApp.handle(
      new Request('http://localhost/org/test-org/servers/1/advanced', { method: 'GET' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toHaveProperty('log_smtp_data');
    expect(body).toHaveProperty('privacy_mode');
    expect(body).toHaveProperty('allow_sender');
    expect(body).toHaveProperty('postmaster_address');
  });
});
