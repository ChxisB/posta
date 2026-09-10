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
    const db = await getDb();
    const rules = await db.query(
      `SELECT * FROM ip_pool_rules WHERE owner_type = 'Server' AND owner_id = $1`,
      [c.params.serverId],
    ) as any[];
    c.set.status = 200;
    return { ip_pool_rules: rules };
  }, {
    detail: { tags: ['IP Pool Rules'], summary: 'List server IP pool rules' },
  })

  .post('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const { ip_pool_id, from_text, to_text } = c.body;
    const uuid = crypto.randomUUID().replace(/-/g, '');
    const result = await db.run(`
      INSERT INTO ip_pool_rules (uuid, owner_type, owner_id, ip_pool_id, from_text, to_text, created_at, updated_at)
      VALUES ($1, 'Server', $2, $3, $4, $5, NOW(), NOW())
      RETURNING id
    `, [uuid, c.params.serverId, ip_pool_id, from_text ?? null, to_text ?? null]);
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
    const db = await getDb();
    const rule = await db.get(
      `SELECT * FROM ip_pool_rules WHERE uuid = $1 AND owner_type = 'Server' AND owner_id = $2`,
      [c.params.ruleId, c.params.serverId],
    ) as any;
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
    const setClauses = fields.map(([k], i) => `${k} = $${i + 1}`);
    const values: any[] = fields.map(([_, v]) => v);
    values.push(rule.id);
    await db.run(
      `UPDATE ip_pool_rules SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
      values,
    );
    const updated = await db.get(`SELECT * FROM ip_pool_rules WHERE id = $1`, [rule.id]) as any;
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
    const db = await getDb();
    const rule = await db.get(
      `SELECT * FROM ip_pool_rules WHERE uuid = $1 AND owner_type = 'Server' AND owner_id = $2`,
      [c.params.ruleId, c.params.serverId],
    ) as any;
    if (!rule) {
      c.set.status = 404;
      return { error: 'RuleNotFound' };
    }
    await db.run(`DELETE FROM ip_pool_rules WHERE id = $1`, [rule.id]);
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
    const db = await getDb();
    const org = await db.get(`SELECT id FROM organizations WHERE permalink = $1`, [
      c.params.orgPermalink,
    ]) as any;
    if (!org) {
      c.set.status = 404;
      return { error: 'OrgNotFound' };
    }
    const rules = await db.query(
      `SELECT * FROM ip_pool_rules WHERE owner_type = 'Organization' AND owner_id = $1`,
      [org.id],
    ) as any[];
    c.set.status = 200;
    return { ip_pool_rules: rules };
  }, {
    detail: { tags: ['IP Pool Rules'], summary: 'List org IP pool rules' },
  })

  .post('/', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const org = await db.get(`SELECT id FROM organizations WHERE permalink = $1`, [
      c.params.orgPermalink,
    ]) as any;
    if (!org) {
      c.set.status = 404;
      return { error: 'OrgNotFound' };
    }
    const { ip_pool_id, from_text, to_text } = c.body;
    const uuid = crypto.randomUUID().replace(/-/g, '');
    const result = await db.run(`
      INSERT INTO ip_pool_rules (uuid, owner_type, owner_id, ip_pool_id, from_text, to_text, created_at, updated_at)
      VALUES ($1, 'Organization', $2, $3, $4, $5, NOW(), NOW())
      RETURNING id
    `, [
      uuid,
      org.id,
      ip_pool_id,
      from_text ?? null,
      to_text ?? null,
    ]);
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
    const db = await getDb();
    const org = await db.get(`SELECT id FROM organizations WHERE permalink = $1`, [
      c.params.orgPermalink,
    ]) as any;
    if (!org) {
      c.set.status = 404;
      return { error: 'OrgNotFound' };
    }
    const rule = await db.get(
      `SELECT * FROM ip_pool_rules WHERE uuid = $1 AND owner_type = 'Organization' AND owner_id = $2`,
      [c.params.ruleId, org.id],
    ) as any;
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
    const setClauses = fields.map(([k], i) => `${k} = $${i + 1}`);
    const values: any[] = fields.map(([_, v]) => v);
    values.push(rule.id);
    await db.run(
      `UPDATE ip_pool_rules SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
      values,
    );
    const updated = await db.get(`SELECT * FROM ip_pool_rules WHERE id = $1`, [rule.id]) as any;
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
    const db = await getDb();
    const org = await db.get(`SELECT id FROM organizations WHERE permalink = $1`, [
      c.params.orgPermalink,
    ]) as any;
    if (!org) {
      c.set.status = 404;
      return { error: 'OrgNotFound' };
    }
    const rule = await db.get(
      `SELECT * FROM ip_pool_rules WHERE uuid = $1 AND owner_type = 'Organization' AND owner_id = $2`,
      [c.params.ruleId, org.id],
    ) as any;
    if (!rule) {
      c.set.status = 404;
      return { error: 'RuleNotFound' };
    }
    await db.run(`DELETE FROM ip_pool_rules WHERE id = $1`, [rule.id]);
    c.set.status = 200;
    return { deleted: true };
  }, {
    detail: { tags: ['IP Pool Rules'], summary: 'Delete an org IP pool rule' },
  });
