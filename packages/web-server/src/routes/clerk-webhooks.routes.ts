import { Elysia, t } from 'elysia';
import { Webhook } from 'svix';

/**
 * Clerk webhook endpoints for syncing users and organizations.
 *
 * Receives webhooks from Clerk when users/orgs are created/updated/deleted
 * and mirrors them in Posta's main database.
 */
export const clerkWebhookRoutes = new Elysia({ prefix: '/api/clerk/webhooks' })

  .post('/', async (c: any) => {
    try {
      const payload = c.body;
      const headers = c.request.headers;

      const svixId = headers.get('svix-id');
      const svixTimestamp = headers.get('svix-timestamp');
      const svixSignature = headers.get('svix-signature');

      if (!svixId || !svixTimestamp || !svixSignature) {
        c.set.status = 400;
        return { error: 'Missing Svix headers' };
      }

      const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
      if (!webhookSecret) {
        c.set.status = 500;
        return { error: 'CLERK_WEBHOOK_SECRET not configured' };
      }

      const wh = new Webhook(webhookSecret);
      const evt = wh.verify(JSON.stringify(payload), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as any;

      const eventType = evt.type as string;
      const data = evt.data ?? {};
      const { getDb } = await import('../index');
      const db = getDb();

      switch (eventType) {
        case 'user.created': {
          const email = data.email_addresses?.[0]?.email_address ?? '';
          const { first_name, last_name, id: clerkId } = data;
          const uuid = crypto.randomUUID().replace(/-/g, '');
          db.run(
            `INSERT INTO users (uuid, first_name, last_name, email_address, oidc_uid, oidc_issuer, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'clerk', datetime('now'), datetime('now'))`,
            [uuid, first_name ?? null, last_name ?? null, email, clerkId],
          );
          console.log(`[clerk] user created: ${clerkId} (${email})`);
          break;
        }

        case 'user.updated': {
          const email = data.email_addresses?.[0]?.email_address ?? '';
          const { first_name, last_name, id: clerkId } = data;
          db.run(
            `UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), email_address = COALESCE(?, email_address), updated_at = datetime('now') WHERE oidc_uid = ?`,
            [first_name ?? null, last_name ?? null, email, clerkId],
          );
          console.log(`[clerk] user updated: ${clerkId}`);
          break;
        }

        case 'user.deleted': {
          const { id: clerkId } = data;
          db.run(`DELETE FROM users WHERE oidc_uid = ?`, [clerkId]);
          console.log(`[clerk] user deleted: ${clerkId}`);
          break;
        }

        case 'organization.created': {
          const { id: clerkOrgId, name, slug, created_at } = data;
          const uuid = crypto.randomUUID().replace(/-/g, '');
          const permalink = slug ?? `org-${Date.now().toString(36)}`;
          const result = db.prepare(`
            INSERT INTO organizations (uuid, name, permalink, clerk_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
          `).run(uuid, name, permalink, clerkOrgId);
          const orgId = Number(result.lastInsertRowid);
          console.log(`[clerk] organization created: ${clerkOrgId} ${name}`);
          break;
        }

        case 'organization.updated': {
          const { id: clerkOrgId, name, slug } = data;
          db.run(
            `UPDATE organizations SET name = COALESCE(?, name), permalink = COALESCE(?, permalink), updated_at = datetime('now') WHERE clerk_id = ?`,
            [name ?? null, slug ?? null, clerkOrgId],
          );
          console.log(`[clerk] organization updated: ${clerkOrgId}`);
          break;
        }

        case 'organization.deleted': {
          const { id: clerkOrgId } = data;
          db.run(`UPDATE organizations SET deleted_at = datetime('now') WHERE clerk_id = ?`, [clerkOrgId]);
          console.log(`[clerk] organization deleted: ${clerkOrgId}`);
          break;
        }

        case 'organizationMembership.created': {
          const { user_id, organization_id } = data;
          // Map Clerk IDs to internal IDs
          const org = db.query(`SELECT id FROM organizations WHERE clerk_id = ?`).get(organization_id) as any;
          const user = db.query(`SELECT id FROM users WHERE oidc_uid = ?`).get(user_id) as any;
          if (org && user) {
            db.run(
              `INSERT OR IGNORE INTO organization_users (organization_id, user_id, created_at) VALUES (?, ?, datetime('now'))`,
              [org.id, user.id],
            );
            console.log(`[clerk] membership created: user ${user_id} → org ${organization_id}`);
          } else {
            console.log(`[clerk] membership skipped: user or org not found locally`);
          }
          break;
        }

        case 'organizationMembership.deleted': {
          const { user_id, organization_id } = data;
          const org = db.query(`SELECT id FROM organizations WHERE clerk_id = ?`).get(organization_id) as any;
          const user = db.query(`SELECT id FROM users WHERE oidc_uid = ?`).get(user_id) as any;
          if (org && user) {
            db.run(`DELETE FROM organization_users WHERE organization_id = ? AND user_id = ?`, [org.id, user.id]);
            console.log(`[clerk] membership deleted: user ${user_id} → org ${organization_id}`);
          }
          break;
        }

        default:
          console.log(`[clerk] unhandled webhook event: ${eventType}`);
      }

      c.set.status = 200;
      return { success: true };

    } catch (err: any) {
      console.error(`[clerk] webhook error:`, err.message);
      c.set.status = 400;
      return { error: `Webhook verification failed: ${err.message}` };
    }
  }, {
    body: t.Any(),
    detail: { tags: ['Clerk'], summary: 'Clerk webhook receiver', hide: true },
  });
