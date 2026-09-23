import { describe, it, expect, beforeAll } from 'bun:test';
import { useTestDatabase } from './test-db';
import { authHeader } from './test-auth';
import { app, getDb } from '../index';

const ADMIN_UID = 'test_admin_for_org_settings';
const AUTH = authHeader(ADMIN_UID);

describe('Organization Settings Routes', () => {
  let testOrgPermalink: string;

  beforeAll(async () => {
    // Use a separate test database for each run to avoid stale schema issues
    await useTestDatabase('org_settings');

    const db = await getDb();
    await db.run(
      `INSERT INTO users (uuid, first_name, last_name, email_address, admin, oidc_uid, oidc_issuer, created_at, updated_at)
       VALUES ($1, 'Admin', 'User', 'admin@test.local', 1, $2, 'clerk', NOW(), NOW())`,
      [crypto.randomUUID().replace(/-/g, ''), ADMIN_UID],
    );

    // Create a test organization to use in settings tests
    const res = await app.handle(
      new Request('http://localhost/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH },
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
          headers: { 'Content-Type': 'application/json', ...AUTH },
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
          headers: { 'Content-Type': 'application/json', ...AUTH },
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
          headers: { 'Content-Type': 'application/json', ...AUTH },
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
          headers: { 'Content-Type': 'application/json', ...AUTH },
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
          headers: { 'Content-Type': 'application/json', ...AUTH },
          body: JSON.stringify({ confirm_text: 'Wrong Name' }),
        }),
      );
      expect(res.status).toBe(422);
      const body = await res.json() as any;
      expect(body.error).toBe('ConfirmationMismatch');
    });
  });
});
