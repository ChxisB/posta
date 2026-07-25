import { describe, it, expect } from 'bun:test';

describe('@posta/core', () => {
  it('should be importable', async () => {
    const posta = await import('../index');
    expect(posta).toBeDefined();
    expect(posta.loadConfig).toBeFunction();
    expect(posta.createLogger).toBeFunction();
    expect(posta.getMainDb).toBeFunction();
    expect(posta.runMigrations).toBeFunction();
    expect(posta.MAIN_DB_DDL).toBeString();
  });
});
