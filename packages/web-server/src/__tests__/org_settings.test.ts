import { describe, it, expect, beforeAll } from 'bun:test';
import { app } from '../index';

describe('Organization Settings Routes', () => {
  let testOrgPermalink: string;

  beforeAll(async () => {
    // Use a separate test database for each run to avoid stale schema issues
    const testId = Date.now();
    process.env.POSTA_MAIN_DB_URL = `postgresql://postgres:postgres@localhost:5432/posta_test_org_settings_${testId}`;
    process.env.POSTA_MESSAGE_DB_URL = `postgresql://postgres:postgres@localhost:5432/posta_test_org_settings_${testId}`;
    process.env.POSTA_CONFIG_FILE_PATH = '/dev/null';

    // Create a test organization to use in settings tests
    const res = await app.handle(
      new Request('http://localhost/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Org', permalink: `test-org-${Date.now()}` }),
      }),
    );
    const body = await res.json() as any;
    testOrgPermalink = body.organization.permalink;
  });

  describe('GET /org/:orgPermalink/settings', () => {
    it('returns organization settings', async () => {
      const res = await app.handle(
        new Request(`http://localhost/org/${testOrgPermalink}/settings`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.organization).toBeDefined();
      expect(body.organization.name).toBe('Test Org');
      expect(body.organization.permalink).toBe(testOrgPermalink);
    });

    it('returns 404 for non-existent org', async () => {
      const res = await app.handle(
        new Request('http://localhost/org/nonexistent-org/settings', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.error).toBe('OrgNotFound');
    });
  });

  describe('PATCH /org/:orgPermalink/settings', () => {
    it('updates organization settings', async () => {
      const res = await app.handle(
        new Request(`http://localhost/org/${testOrgPermalink}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Updated Org', time_zone: 'America/New_York' }),
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.organization).toBeDefined();
      expect(body.organization.name).toBe('Updated Org');
      expect(body.organization.time_zone).toBe('America/New_York');
    });
  });

  describe('GET /org/:orgPermalink/delete', () => {
    it('returns org info for delete confirmation', async () => {
      const res = await app.handle(
        new Request(`http://localhost/org/${testOrgPermalink}/delete`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.organization).toBeDefined();
      expect(body.organization.name).toBeTruthy();
    });
  });

  describe('DELETE /org/:orgPermalink/delete', () => {
    it('returns 422 when confirm_text does not match org name', async () => {
      const res = await app.handle(
        new Request(`http://localhost/org/${testOrgPermalink}/delete`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm_text: 'Wrong Name' }),
        }),
      );
      expect(res.status).toBe(422);
      const body = await res.json() as any;
      expect(body.error).toBe('ConfirmationMismatch');
    });
  });
});
