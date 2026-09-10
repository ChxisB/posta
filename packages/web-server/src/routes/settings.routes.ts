import { Elysia, t } from 'elysia';

export const settingsRoutes = new Elysia({ prefix: '/settings' })

  .get('/', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const users = await db.query(`SELECT * FROM users LIMIT 1`) as any[];
    c.set.status = 200;
    return { user: users[0] ?? {} };
  }, { detail: { tags: ['Settings'], summary: 'Get user settings' } })

  .patch('/', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { user: {} }; }
    const values: any[] = fields.map(([_, v]) => v);
    values.push(1);
    const setClauses = fields.map(([k], i) => `${k} = $${i + 1}`);
    await db.run(`UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    c.set.status = 200;
    return { user: { ...c.body } };
  }, {
    body: t.Object({ time_zone: t.Optional(t.String()), first_name: t.Optional(t.String()), last_name: t.Optional(t.String()) }),
    detail: { tags: ['Settings'], summary: 'Update user settings' },
  });
