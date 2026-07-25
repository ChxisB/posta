import { Elysia, t } from 'elysia';

/**
 * Organization-scoped IP pool management, settings, and delete routes.
 */
export const orgSettingsRoutes = new Elysia({ prefix: '/org/:orgPermalink' })

  // ── IP Pool Assignments ──────────────────────────────────────────

  .get('/ip_pools', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const pools = db.query(
      `SELECT p.* FROM ip_pools p
       INNER JOIN organization_ip_pools oip ON oip.ip_pool_id = p.id
       WHERE oip.organization_id = (SELECT id FROM organizations WHERE permalink = ?)
       ORDER BY p.name`
    ).all(c.params.orgPermalink) as any[];
    c.set.status = 200;
    return { ip_pools: pools };
  }, { detail: { tags: ['Organization'], summary: 'List org IP pools' } })

  .put('/ip_pools/assignments', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const { ip_pool_ids } = c.body as { ip_pool_ids: number[] };

    // Resolve org ID from permalink
    const org = db.query(`SELECT id FROM organizations WHERE permalink = ?`).get(c.params.orgPermalink) as any;
    if (!org) { c.set.status = 404; return { error: 'OrgNotFound' }; }

    // Validate all requested pool IDs exist
    if (ip_pool_ids.length > 0) {
      const placeholders = ip_pool_ids.map(() => '?').join(',');
      const count = db.query(
        `SELECT COUNT(*) as cnt FROM ip_pools WHERE id IN (${placeholders})`
      ).get(...ip_pool_ids) as any;
      if (count.cnt !== ip_pool_ids.length) {
        c.set.status = 422;
        return { error: 'InvalidPoolIds', message: 'One or more IP pool IDs do not exist' };
      }
    }

    // Replace assignments within a transaction
    const assignTx = db.transaction(() => {
      db.run(`DELETE FROM organization_ip_pools WHERE organization_id = ?`, [org.id]);
      for (const poolId of ip_pool_ids) {
        db.run(
          `INSERT INTO organization_ip_pools (organization_id, ip_pool_id, created_at, updated_at)
           VALUES (?, ?, datetime('now'), datetime('now'))`,
          [org.id, poolId]
        );
      }
    });
    assignTx();

    c.set.status = 200;
    return { assigned: true, pool_ids: ip_pool_ids };
  }, {
    body: t.Object({ ip_pool_ids: t.Array(t.Number()) }),
    detail: { tags: ['Organization'], summary: 'Replace IP pool assignments' },
  })

  // ── Settings ─────────────────────────────────────────────────────

  .get('/settings', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const org = db.query(
      `SELECT name, permalink, time_zone, ip_pool_id FROM organizations WHERE permalink = ?`
    ).get(c.params.orgPermalink) as any;
    if (!org) { c.set.status = 404; return { error: 'OrgNotFound' }; }
    c.set.status = 200;
    return { organization: org };
  }, { detail: { tags: ['Organization'], summary: 'Get org settings' } })

  .patch('/settings', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();

    // Look up the org first
    const org = db.query(`SELECT id, permalink FROM organizations WHERE permalink = ?`).get(c.params.orgPermalink) as any;
    if (!org) { c.set.status = 404; return { error: 'OrgNotFound' }; }

    const body = c.body as Record<string, any>;
    const fields = Object.entries(body).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) {
      c.set.status = 200;
      return { organization: org };
    }

    const setClauses = fields.map(([k]) => `${k} = ?`);
    const values: any[] = fields.map(([_, v]) => v);
    values.push(org.id);

    db.prepare(
      `UPDATE organizations SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id = ?`
    ).run(...values);

    // Return the updated org
    const updated = db.query(
      `SELECT name, permalink, time_zone, ip_pool_id FROM organizations WHERE id = ?`
    ).get(org.id) as any;

    c.set.status = 200;
    return { organization: updated };
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      permalink: t.Optional(t.String()),
      time_zone: t.Optional(t.String()),
    }),
    detail: { tags: ['Organization'], summary: 'Update org settings' },
  })

  // ── Delete ───────────────────────────────────────────────────────

  .get('/delete', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const org = db.query(
      `SELECT name, permalink FROM organizations WHERE permalink = ?`
    ).get(c.params.orgPermalink) as any;
    if (!org) { c.set.status = 404; return { error: 'OrgNotFound' }; }
    c.set.status = 200;
    return { organization: org };
  }, { detail: { tags: ['Organization'], summary: 'Get org info for delete confirmation' } })

  .delete('/delete', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const { confirm_text } = c.body as { confirm_text: string };

    // Look up the org
    const org = db.query(
      `SELECT name, permalink FROM organizations WHERE permalink = ?`
    ).get(c.params.orgPermalink) as any;
    if (!org) { c.set.status = 404; return { error: 'OrgNotFound' }; }

    // Validate confirmation text matches org name (case-insensitive, trimmed)
    if (confirm_text.trim().toLowerCase() !== org.name.trim().toLowerCase()) {
      c.set.status = 422;
      return {
        error: 'ConfirmationMismatch',
        message: 'The confirmation text did not match the organization name',
      };
    }

    // Soft-delete
    db.run(`UPDATE organizations SET deleted_at = datetime('now') WHERE permalink = ?`, [org.permalink]);

    c.set.status = 200;
    return { deleted: true };
  }, {
    body: t.Object({ confirm_text: t.String() }),
    detail: { tags: ['Organization'], summary: 'Delete an organization' },
  });
