import { Elysia, t } from 'elysia';

/**
 * User management routes.
 */
export const userRoutes = new Elysia({ prefix: '/users' })

  .get('/', async (c: any) => {
    const { getDb } = await import('../index');
    const db = getDb();
    const users = db.query(`SELECT * FROM users`).all() as any[];
    c.set.status = 200;
    return { users };
  }, { detail: { tags: ['Users'], summary: 'List users' } })

  .post('/', async (c: any) => {
    const { getDb } = await import('../index');
    const db = getDb();
    const { first_name, last_name, email_address, admin } = c.body;
    const uuid = crypto.randomUUID().replace(/-/g, '');
    const stmt = db.prepare(`
      INSERT INTO users (uuid, first_name, last_name, email_address, admin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(uuid, first_name ?? null, last_name ?? null, email_address, admin ?? false);
    c.set.status = 201;
    return { user: { id: Number(result.lastInsertRowid), uuid, first_name, last_name, email_address } };
  }, {
    body: t.Object({
      email_address: t.String(),
      first_name: t.Optional(t.String()),
      last_name: t.Optional(t.String()),
      admin: t.Optional(t.Boolean()),
    }),
    detail: { tags: ['Users'], summary: 'Create a user' },
  })

  .get('/:userId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = getDb();
    const user = db.query(`SELECT * FROM users WHERE id = ?`).get(c.params.userId) as any;
    if (!user) { c.set.status = 404; return { error: 'UserNotFound' }; }
    c.set.status = 200;
    return { user };
  }, { detail: { tags: ['Users'], summary: 'Get user details' } })

  .patch('/:userId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { user: {} }; }
    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.userId);
    db.prepare(`UPDATE users SET ${fields.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);
    c.set.status = 200;
    return { user: { id: parseInt(c.params.userId), ...c.body } };
  }, {
    body: t.Object({ first_name: t.Optional(t.String()), last_name: t.Optional(t.String()), email_address: t.Optional(t.String()), admin: t.Optional(t.Boolean()) }),
    detail: { tags: ['Users'], summary: 'Update a user' },
  })

  .delete('/:userId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = getDb();
    db.run(`DELETE FROM users WHERE id = ?`, [c.params.userId]);
    c.set.status = 200;
    return { deleted: true };
  }, { detail: { tags: ['Users'], summary: 'Delete a user' } });
