import { Elysia, t } from 'elysia';

/**
 * Track domain management routes.
 */
export const trackDomainsRoutes = new Elysia({ prefix: '/org/:orgPermalink/servers/:serverId/track_domains' })

  // GET / — List track domains for a server
  .get('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const track_domains = db.query(
      `SELECT * FROM track_domains WHERE server_id = ? ORDER BY name`,
    ).all(c.params.serverId) as any[];
    c.set.status = 200;
    return { track_domains };
  }, { detail: { tags: ['Track Domains'], summary: 'List track domains for a server' } })

  // POST / — Create a track domain
  .post('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const { name, domain_id, track_loads, track_clicks, excluded_click_domains, ssl_enabled } = c.body;

    // Validate domain_id exists if provided
    if (domain_id !== undefined && domain_id !== null) {
      const domain = db.query(`SELECT id FROM domains WHERE id = ?`).get(domain_id) as any;
      if (!domain) { c.set.status = 422; return { error: 'DomainNotFound', message: 'domain_id does not exist' }; }
    }

    const uuid = crypto.randomUUID().replace(/-/g, '');
    const stmt = db.prepare(`
      INSERT INTO track_domains (server_id, uuid, name, domain_id, track_loads, track_clicks, excluded_click_domains, ssl_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(
      c.params.serverId,
      uuid,
      name,
      domain_id ?? null,
      typeof track_loads === 'boolean' ? (track_loads ? 1 : 0) : 1,
      typeof track_clicks === 'boolean' ? (track_clicks ? 1 : 0) : 1,
      excluded_click_domains ?? null,
      typeof ssl_enabled === 'boolean' ? (ssl_enabled ? 1 : 0) : 1,
    );

    const track_domain = db.query(`SELECT * FROM track_domains WHERE id = ?`).get(Number(result.lastInsertRowid)) as any;
    c.set.status = 201;
    return { track_domain };
  }, {
    body: t.Object({
      name: t.String(),
      domain_id: t.Optional(t.Number()),
      track_loads: t.Optional(t.Boolean()),
      track_clicks: t.Optional(t.Boolean()),
      excluded_click_domains: t.Optional(t.String()),
      ssl_enabled: t.Optional(t.Boolean()),
    }),
    detail: { tags: ['Track Domains'], summary: 'Create a track domain' },
  })

  // GET /:domainId — Get a track domain (lookup by UUID)
  .get('/:domainId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const track_domain = db.query(
      `SELECT * FROM track_domains WHERE uuid = ? AND server_id = ?`,
    ).get(c.params.domainId, c.params.serverId) as any;
    if (!track_domain) { c.set.status = 404; return { error: 'TrackDomainNotFound' }; }
    c.set.status = 200;
    return { track_domain };
  }, { detail: { tags: ['Track Domains'], summary: 'Get a track domain' } })

  // PATCH /:domainId — Update a track domain (lookup by UUID)
  .patch('/:domainId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();

    const existing = db.query(
      `SELECT * FROM track_domains WHERE uuid = ? AND server_id = ?`,
    ).get(c.params.domainId, c.params.serverId) as any;
    if (!existing) { c.set.status = 404; return { error: 'TrackDomainNotFound' }; }

    const allowedFields = ['name', 'track_loads', 'track_clicks', 'excluded_click_domains', 'ssl_enabled'];
    const boolFields = ['track_loads', 'track_clicks', 'ssl_enabled'];
    const fields: [string, any][] = [];

    for (const [key, value] of Object.entries(c.body as Record<string, any>)) {
      if (allowedFields.includes(key) && value !== undefined) {
        const sqlValue = boolFields.includes(key) ? (value ? 1 : 0) : value;
        fields.push([key, sqlValue]);
      }
    }

    if (fields.length === 0) {
      c.set.status = 200;
      return { track_domain: existing };
    }

    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.domainId, c.params.serverId);
    db.prepare(
      `UPDATE track_domains SET ${fields.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE uuid = ? AND server_id = ?`,
    ).run(...values);

    const track_domain = db.query(
      `SELECT * FROM track_domains WHERE uuid = ? AND server_id = ?`,
    ).get(c.params.domainId, c.params.serverId) as any;
    c.set.status = 200;
    return { track_domain };
  }, {
    body: t.Object({
      track_loads: t.Optional(t.Boolean()),
      track_clicks: t.Optional(t.Boolean()),
      excluded_click_domains: t.Optional(t.String()),
      ssl_enabled: t.Optional(t.Boolean()),
    }),
    detail: { tags: ['Track Domains'], summary: 'Update a track domain' },
  })

  // DELETE /:domainId — Delete a track domain (lookup by UUID)
  .delete('/:domainId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const result = db.prepare(
      `DELETE FROM track_domains WHERE uuid = ? AND server_id = ?`,
    ).run(c.params.domainId, c.params.serverId);
    if (result.changes === 0) { c.set.status = 404; return { error: 'TrackDomainNotFound' }; }
    c.set.status = 200;
    return { deleted: true };
  }, { detail: { tags: ['Track Domains'], summary: 'Delete a track domain' } })

  // POST /:domainId/toggle_ssl — Toggle ssl_enabled
  .post('/:domainId/toggle_ssl', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const track_domain = db.query(
      `SELECT ssl_enabled FROM track_domains WHERE uuid = ? AND server_id = ?`,
    ).get(c.params.domainId, c.params.serverId) as any;
    if (!track_domain) { c.set.status = 404; return { error: 'TrackDomainNotFound' }; }
    const newValue = track_domain.ssl_enabled ? 0 : 1;
    db.prepare(
      `UPDATE track_domains SET ssl_enabled = ?, updated_at = datetime('now') WHERE uuid = ? AND server_id = ?`,
    ).run(newValue, c.params.domainId, c.params.serverId);
    c.set.status = 200;
    return { ssl_enabled: Boolean(newValue) };
  }, { detail: { tags: ['Track Domains'], summary: 'Toggle SSL for a track domain' } })

  // POST /:domainId/check — Verify CNAME record points to configured track domain
  .post('/:domainId/check', async (c: any) => {
    const { getDb, getConfig } = await import('../../index');
    const db = getDb();
    const config = getConfig();
    const track_domain = db.query(
      `SELECT td.id, td.name, td.domain_id, d.name as domain_name FROM track_domains td LEFT JOIN domains d ON d.id = td.domain_id WHERE td.uuid = ? AND td.server_id = ?`,
    ).get(c.params.domainId, c.params.serverId) as any;
    if (!track_domain) { c.set.status = 404; return { error: 'TrackDomainNotFound' }; }

    const fullName = `${track_domain.name}.${track_domain.domain_name}`;
    const expectedTarget = config.dns.track_domain;

    let dnsStatus: string;
    let dnsError: string | null;

    try {
      const { DnsResolver } = await import('@posta/core');
      const resolver = DnsResolver.local(config.dns.timeout);
      const records = await resolver.cname(fullName, config.dns.timeout);

      if (records.length === 0) {
        dnsStatus = 'Missing';
        dnsError = `There is no record at ${fullName}`;
      } else if (records.length === 1 && records[0] === expectedTarget) {
        dnsStatus = 'OK';
        dnsError = null;
      } else {
        dnsStatus = 'Invalid';
        dnsError = `There is a CNAME record at ${fullName} but it points to ${records[0] ?? 'unknown'} which is incorrect. It should point to ${expectedTarget}.`;
      }
    } catch (err: any) {
      dnsStatus = 'Error';
      dnsError = `DNS lookup failed: ${err.message}`;
    }

    db.prepare(
      `UPDATE track_domains SET dns_checked_at = datetime('now'), dns_status = ?, dns_error = ?, updated_at = datetime('now') WHERE uuid = ? AND server_id = ?`,
    ).run(dnsStatus, dnsError, c.params.domainId, c.params.serverId);
    c.set.status = 200;
    return { status: dnsStatus, error: dnsError };
  }, { detail: { tags: ['Track Domains'], summary: 'Check DNS for a track domain' } });
