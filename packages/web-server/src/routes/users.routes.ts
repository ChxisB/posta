import { Elysia, t } from 'elysia';
import { requireAdmin } from '../middleware/require-auth';

// `linked` is false until an invited person signs in with the email address
// an administrator added them under.
const COLUMNS = `id, uuid, first_name, last_name, email_address, (admin <> 0) AS admin,
  (oidc_uid IS NOT NULL) AS linked, created_at, updated_at`;

async function otherAdminCount(db: any, userId: string | number): Promise<number> {
  const row = await db.get(
    `SELECT count(*)::int AS n FROM users WHERE admin <> 0 AND id <> $1`,
    [userId],
  ) as any;
  return Number(row?.n ?? 0);
}

/**
 * User management routes. Administrator only: adding someone here is what
 * lets them into this installation when they sign in.
 */
export const userRoutes = new Elysia({ prefix: '/users' })
  .onBeforeHandle(requireAdmin)

  .get('/', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const users = await db.query(`SELECT ${COLUMNS} FROM users ORDER BY id`) as any[];
    c.set.status = 200;
    return { users };
  }, { detail: { tags: ['Users'], summary: 'List users' } })

  .post('/', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const { first_name, last_name, admin } = c.body;
    const email_address = c.body.email_address.trim();
    const existing = await db.get(
      `SELECT id FROM users WHERE lower(email_address) = lower($1)`,
      [email_address],
    );
    if (existing) {
      c.set.status = 409;
      return { error: 'EmailTaken', message: `${email_address} already has an account.` };
    }
    const uuid = crypto.randomUUID().replace(/-/g, '');
    const user = await db.get(`
      INSERT INTO users (uuid, first_name, last_name, email_address, admin, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING ${COLUMNS}
    `, [uuid, first_name ?? null, last_name ?? null, email_address, admin ? 1 : 0]);
    c.set.status = 201;
    return { user };
  }, {
    body: t.Object({
      email_address: t.String({ minLength: 3 }),
      first_name: t.Optional(t.String()),
      last_name: t.Optional(t.String()),
      admin: t.Optional(t.Boolean()),
    }),
    detail: { tags: ['Users'], summary: 'Add a user' },
  })

  .get('/:userId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const user = await db.get(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [c.params.userId]) as any;
    if (!user) { c.set.status = 404; return { error: 'UserNotFound' }; }
    c.set.status = 200;
    return { user };
  }, { detail: { tags: ['Users'], summary: 'Get user details' } })

  .patch('/:userId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const target = await db.get(`SELECT id, admin FROM users WHERE id = $1`, [c.params.userId]) as any;
    if (!target) { c.set.status = 404; return { error: 'UserNotFound' }; }

    const { first_name, last_name, email_address, admin } = c.body;
    if (admin === false && target.admin && (await otherAdminCount(db, target.id)) === 0) {
      c.set.status = 409;
      return { error: 'LastAdmin', message: 'Posta needs at least one administrator. Make someone else an admin first.' };
    }

    const sets: string[] = [];
    const values: any[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (first_name !== undefined) set('first_name', first_name);
    if (last_name !== undefined) set('last_name', last_name);
    if (email_address !== undefined) set('email_address', email_address.trim());
    if (admin !== undefined) set('admin', admin ? 1 : 0);

    values.push(target.id);
    const user = sets.length === 0
      ? await db.get(`SELECT ${COLUMNS} FROM users WHERE id = $1`, values)
      : await db.get(
        `UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING ${COLUMNS}`,
        values,
      );
    c.set.status = 200;
    return { user };
  }, {
    body: t.Object({
      first_name: t.Optional(t.String()),
      last_name: t.Optional(t.String()),
      email_address: t.Optional(t.String({ minLength: 3 })),
      admin: t.Optional(t.Boolean()),
    }),
    detail: { tags: ['Users'], summary: 'Update a user' },
  })

  .delete('/:userId', async (c: any) => {
    const { getDb } = await import('../index');
    const db = await getDb();
    const target = await db.get(`SELECT id, admin FROM users WHERE id = $1`, [c.params.userId]) as any;
    if (!target) { c.set.status = 404; return { error: 'UserNotFound' }; }
    if (Number(target.id) === c.user.id) {
      c.set.status = 409;
      return { error: 'CannotDeleteSelf', message: 'You can\'t delete your own account.' };
    }
    if (target.admin && (await otherAdminCount(db, target.id)) === 0) {
      c.set.status = 409;
      return { error: 'LastAdmin', message: 'Posta needs at least one administrator.' };
    }
    await db.run(`DELETE FROM users WHERE id = $1`, [target.id]);
    c.set.status = 200;
    return { deleted: true };
  }, { detail: { tags: ['Users'], summary: 'Delete a user' } });
