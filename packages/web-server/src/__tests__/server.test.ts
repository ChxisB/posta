import { describe, it, expect } from 'bun:test';

describe('@posta/web-server', () => {
  it('exports an app with a fetch handler', async () => {
    // Dynamic import — the .listen() call is guarded by import.meta.main
    const mod = await import('../index');
    expect(mod.app).toBeDefined();
    expect(typeof mod.app.fetch).toBe('function');
  });
});
