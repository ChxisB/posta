import { Elysia, t } from 'elysia';

/**
 * IP Pool Rule routes — server-scoped.
 * Under /org/:orgPermalink/servers/:serverId/ip_pool_rules
 */
export const serverIpPoolRuleRoutes = new Elysia({
  prefix: '/org/:orgPermalink/servers/:serverId/ip_pool_rules',
})

  .get('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const rules = db.query(
      `SELECT * FROM ip_pool_rules WHERE owner_type = 'Server' AND owner_id = ?`,
    ).all(c.params.serverId) as any[];
    c.set.status = 200;
    return { ip_pool_rules: rules };
  }, {
    detail: { tags: ['IP Pool Rules'], summary: 'List server IP pool rules' },
  })

  .post('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const { ip_pool_id, from_text, to_text } = c.body;
    const uuid = crypto.randomUUID().replace(/-/g, '');
    const stmt = db.prepare(`
      INSERT INTO ip_pool_rules (uuid, owner_type, owner_id, ip_pool_id, from_text, to_text, created_at, updated_at)
      VALUES (?, 'Server', ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(uuid, c.params.serverId, ip_pool_id, from_text ?? null, to_text ?? null);
    c.set.status = 201;
    return {
      ip_pool_rule: {
        id: Number(result.lastInsertRowid),
        uuid,
        owner_type: 'Server',
        owner_id: parseInt(c.params.serverId),
        ip_pool_id,
        from_text: from_text ?? null,
        to_text: to_text ?? null,
      },
    };
  }, {
    body: t.Object({
      ip_pool_id: t.Number(),
      from_text: t.Optional(t.String()),
      to_text: t.Optional(t.String()),
    }),
    detail: { tags: ['IP Pool Rules'], summary: 'Create a server IP pool rule' },
  })

  .patch('/:ruleId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const rule = db.query(
      `SELECT * FROM ip_pool_rules WHERE uuid = ? AND owner_type = 'Server' AND owner_id = ?`,
    ).get(c.params.ruleId, c.params.serverId) as any;
    if (!rule) {
      c.set.status = 404;
      return { error: 'RuleNotFound' };
    }
    const fields = Object.entries(c.body as Record<string, any>).filter(
      ([_, v]) => v !== undefined,
    );
    if (fields.length === 0) {
      c.set.status = 200;
      return { ip_pool_rule: rule };
    }
    const setClauses = fields.map(([k]) => `${k} = ?`);
    const values: any[] = fields.map(([_, v]) => v);
    values.push(rule.id);
    db.prepare(
      `UPDATE ip_pool_rules SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
    ).run(...values);
    const updated = db.query(`SELECT * FROM ip_pool_rules WHERE id = ?`).get(rule.id) as any;
    c.set.status = 200;
    return { ip_pool_rule: updated };
  }, {
    body: t.Object({
      ip_pool_id: t.Optional(t.Number()),
      from_text: t.Optional(t.String()),
      to_text: t.Optional(t.String()),
    }),
    detail: { tags: ['IP Pool Rules'], summary: 'Update a server IP pool rule' },
  })

  .delete('/:ruleId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const rule = db.query(
      `SELECT * FROM ip_pool_rules WHERE uuid = ? AND owner_type = 'Server' AND owner_id = ?`,
    ).get(c.params.ruleId, c.params.serverId) as any;
    if (!rule) {
      c.set.status = 404;
      return { error: 'RuleNotFound' };
    }
    db.run(`DELETE FROM ip_pool_rules WHERE id = ?`, [rule.id]);
    c.set.status = 200;
    return { deleted: true };
  }, {
    detail: { tags: ['IP Pool Rules'], summary: 'Delete a server IP pool rule' },
  });

/**
 * IP Pool Rule routes — org-scoped.
 * Under /org/:orgPermalink/ip_pool_rules
 */
export const orgIpPoolRuleRoutes = new Elysia({
  prefix: '/org/:orgPermalink/ip_pool_rules',
})

  .get('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const org = db.query(`SELECT id FROM organizations WHERE permalink = ?`).get(
      c.params.orgPermalink,
    ) as any;
    if (!org) {
      c.set.status = 404;
      return { error: 'OrgNotFound' };
    }
    const rules = db.query(
      `SELECT * FROM ip_pool_rules WHERE owner_type = 'Organization' AND owner_id = ?`,
    ).all(org.id) as any[];
    c.set.status = 200;
    return { ip_pool_rules: rules };
  }, {
    detail: { tags: ['IP Pool Rules'], summary: 'List org IP pool rules' },
  })

  .post('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const org = db.query(`SELECT id FROM organizations WHERE permalink = ?`).get(
      c.params.orgPermalink,
    ) as any;
    if (!org) {
      c.set.status = 404;
      return { error: 'OrgNotFound' };
    }
    const { ip_pool_id, from_text, to_text } = c.body;
    const uuid = crypto.randomUUID().replace(/-/g, '');
    const stmt = db.prepare(`
      INSERT INTO ip_pool_rules (uuid, owner_type, owner_id, ip_pool_id, from_text, to_text, created_at, updated_at)
      VALUES (?, 'Organization', ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(
      uuid,
      org.id,
      ip_pool_id,
      from_text ?? null,
      to_text ?? null,
    );
    c.set.status = 201;
    return {
      ip_pool_rule: {
        id: Number(result.lastInsertRowid),
        uuid,
        owner_type: 'Organization',
        owner_id: org.id,
        ip_pool_id,
        from_text: from_text ?? null,
        to_text: to_text ?? null,
      },
    };
  }, {
    body: t.Object({
      ip_pool_id: t.Number(),
      from_text: t.Optional(t.String()),
      to_text: t.Optional(t.String()),
    }),
    detail: { tags: ['IP Pool Rules'], summary: 'Create an org IP pool rule' },
  })

  .patch('/:ruleId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const org = db.query(`SELECT id FROM organizations WHERE permalink = ?`).get(
      c.params.orgPermalink,
    ) as any;
    if (!org) {
      c.set.status = 404;
      return { error: 'OrgNotFound' };
    }
    const rule = db.query(
      `SELECT * FROM ip_pool_rules WHERE uuid = ? AND owner_type = 'Organization' AND owner_id = ?`,
    ).get(c.params.ruleId, org.id) as any;
    if (!rule) {
      c.set.status = 404;
      return { error: 'RuleNotFound' };
    }
    const fields = Object.entries(c.body as Record<string, any>).filter(
      ([_, v]) => v !== undefined,
    );
    if (fields.length === 0) {
      c.set.status = 200;
      return { ip_pool_rule: rule };
    }
    const setClauses = fields.map(([k]) => `${k} = ?`);
    const values: any[] = fields.map(([_, v]) => v);
    values.push(rule.id);
    db.prepare(
      `UPDATE ip_pool_rules SET ${setClauses.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
    ).run(...values);
    const updated = db.query(`SELECT * FROM ip_pool_rules WHERE id = ?`).get(rule.id) as any;
    c.set.status = 200;
    return { ip_pool_rule: updated };
  }, {
    body: t.Object({
      ip_pool_id: t.Optional(t.Number()),
      from_text: t.Optional(t.String()),
      to_text: t.Optional(t.String()),
    }),
    detail: { tags: ['IP Pool Rules'], summary: 'Update an org IP pool rule' },
  })

  .delete('/:ruleId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = getDb();
    const org = db.query(`SELECT id FROM organizations WHERE permalink = ?`).get(
      c.params.orgPermalink,
    ) as any;
    if (!org) {
      c.set.status = 404;
      return { error: 'OrgNotFound' };
    }
    const rule = db.query(
      `SELECT * FROM ip_pool_rules WHERE uuid = ? AND owner_type = 'Organization' AND owner_id = ?`,
    ).get(c.params.ruleId, org.id) as any;
    if (!rule) {
      c.set.status = 404;
      return { error: 'RuleNotFound' };
    }
    db.run(`DELETE FROM ip_pool_rules WHERE id = ?`, [rule.id]);
    c.set.status = 200;
    return { deleted: true };
  }, {
    detail: { tags: ['IP Pool Rules'], summary: 'Delete an org IP pool rule' },
  });
