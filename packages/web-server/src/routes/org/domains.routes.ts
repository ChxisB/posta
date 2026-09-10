import { Elysia, t } from 'elysia';

/**
 * Domain management routes.
 */
export const domainRoutes = new Elysia({ prefix: '/org/:orgPermalink' })

  // GET /org/:permalink/domains — List domains for org
  .get('/domains', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const domains = await db.query(
      `SELECT * FROM domains WHERE server_id IN (SELECT id FROM servers WHERE organization_id = (SELECT id FROM organizations WHERE permalink = $1))`,
      [c.params.orgPermalink],
    ) as any[];
    c.set.status = 200;
    return { domains };
  }, { detail: { tags: ['Domains'], summary: 'List domains' } })

  // POST /org/:permalink/domains — Create org-level domain
  .post('/domains', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const { name, server_id } = c.body;

    // Look up the organization
    const org = await db.get(`SELECT id FROM organizations WHERE permalink = $1`, [c.params.orgPermalink]) as any;
    if (!org) { c.set.status = 404; return { error: 'OrganizationNotFound' }; }

    const uuid = crypto.randomUUID().replace(/-/g, '');
    const verificationToken = crypto.randomUUID().replace(/-/g, '');
    const result = await db.run(`
      INSERT INTO domains (server_id, uuid, name, verification_token, owner_type, owner_id, dns_checked_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'Organization', $5, NOW(), NOW(), NOW())
      RETURNING id
    `, [server_id ?? null, uuid, name, verificationToken, org.id]);
    c.set.status = 201;
    return { domain: { id: Number(result.lastInsertRowid), uuid, name, owner_type: 'Organization', verification_token: verificationToken } };
  }, {
    body: t.Object({
      name: t.String(),
      server_id: t.Optional(t.Number()),
    }),
    detail: { tags: ['Domains'], summary: 'Create an org-level domain' },
  })

  // GET /org/:permalink/servers/:serverId/domains — List domains for a server
  .get('/servers/:serverId/domains', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const domains = await db.query(`SELECT * FROM domains WHERE server_id = $1`, [c.params.serverId]) as any[];
    c.set.status = 200;
    return { domains };
  }, { detail: { tags: ['Domains'], summary: 'List domains for a server' } })

  // POST /org/:permalink/servers/:serverId/domains — Add domain
  .post('/servers/:serverId/domains', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const { name } = c.body;
    const uuid = crypto.randomUUID().replace(/-/g, '');
    const verificationToken = crypto.randomUUID().replace(/-/g, '');
    const result = await db.run(`
      INSERT INTO domains (server_id, uuid, name, verification_token, dns_checked_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
      RETURNING id
    `, [c.params.serverId, uuid, name, verificationToken]);
    c.set.status = 201;
    return { domain: { id: Number(result.lastInsertRowid), uuid, name, verification_token: verificationToken } };
  }, {
    body: t.Object({ name: t.String() }),
    detail: { tags: ['Domains'], summary: 'Add a domain' },
  })

  // DELETE /org/:permalink/servers/:serverId/domains/:domainId
  .delete('/servers/:serverId/domains/:domainId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    await db.run(`DELETE FROM domains WHERE id = $1 AND server_id = $2`, [c.params.domainId, c.params.serverId]);
    c.set.status = 200;
    return { deleted: true };
  }, { detail: { tags: ['Domains'], summary: 'Delete a domain' } })

  // PATCH /org/:permalink/servers/:serverId/domains/:domainId — Update domain
  .patch('/servers/:serverId/domains/:domainId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const fields = Object.entries(c.body as Record<string, any>).filter(([_, v]) => v !== undefined);
    if (fields.length === 0) { c.set.status = 200; return { domain: {} }; }
    const values: any[] = fields.map(([_, v]) => v);
    values.push(c.params.domainId);
    const setClauses = fields.map(([k], i) => `${k} = $${i + 1}`);
    await db.run(`UPDATE domains SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    c.set.status = 200;
    return { domain: { id: parseInt(c.params.domainId), ...c.body } };
  }, {
    body: t.Object({ name: t.Optional(t.String()) }),
    detail: { tags: ['Domains'], summary: 'Update a domain' },
  })

  // GET /org/:permalink/servers/:serverId/domains/:domainId
  .get('/servers/:serverId/domains/:domainId', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const domain = await db.get(`SELECT * FROM domains WHERE id = $1 AND server_id = $2`, [
      c.params.domainId,
      c.params.serverId,
    ]) as any;
    if (!domain) { c.set.status = 404; return { error: 'DomainNotFound' }; }
    c.set.status = 200;
    return { domain };
  }, { detail: { tags: ['Domains'], summary: 'Get a domain' } })

  // POST /org/:permalink/servers/:serverId/domains/:domainId/verify
  .post('/servers/:serverId/domains/:domainId/verify', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    await db.run(`UPDATE domains SET verified_at = NOW() WHERE id = $1`, [c.params.domainId]);
    c.set.status = 200;
    return { verified: true };
  }, { detail: { tags: ['Domains'], summary: 'Verify a domain' } })

  // GET /org/:permalink/servers/:serverId/domains/:domainId/verify — Get verification status
  .get('/servers/:serverId/domains/:domainId/verify', async (c: any) => {
    const { getDb } = await import('../../index');
    const db = await getDb();
    const domain = await db.get(
      `SELECT id, name, uuid, verification_token, verification_method, verified_at,
              spf_status, spf_error, dkim_status, dkim_error,
              mx_status, mx_error, return_path_status, return_path_error
       FROM domains WHERE id = $1 AND server_id = $2`,
      [c.params.domainId, c.params.serverId],
    ) as any;
    if (!domain) { c.set.status = 404; return { error: 'DomainNotFound' }; }
    c.set.status = 200;
    return {
      domain: {
        id: domain.id,
        name: domain.name,
        uuid: domain.uuid,
        verification_token: domain.verification_token,
        verification_method: domain.verification_method,
        verified: !!domain.verified_at,
        verified_at: domain.verified_at ?? null,
        spf_status: domain.spf_status ?? null,
        spf_error: domain.spf_error ?? null,
        dkim_status: domain.dkim_status ?? null,
        dkim_error: domain.dkim_error ?? null,
        mx_status: domain.mx_status ?? null,
        mx_error: domain.mx_error ?? null,
        return_path_status: domain.return_path_status ?? null,
        return_path_error: domain.return_path_error ?? null,
      },
    };
  }, { detail: { tags: ['Domains'], summary: 'Get domain verification status' } })

  // GET /org/:permalink/servers/:serverId/domains/:domainId/dns — DNS setup instructions
  .get('/servers/:serverId/domains/:domainId/dns', async (c: any) => {
    const { getDb, getConfig } = await import('../../index');
    const db = await getDb();
    const config = await getConfig();
    const domain = await db.get(`SELECT name FROM domains WHERE id = $1`, [c.params.domainId]) as any;
    const selector = (c.query.selector as string) ?? config.dns.dkim_identifier;
    c.set.status = 200;
    return {
      domain: domain?.name ?? 'unknown',
      spf: `v=spf1 include:${config.dns.spf_include} ~all`,
      dkim: `${selector}._domainkey`,
      mx: config.dns.mx_records.join(', '),
      return_path: config.dns.return_path_domain,
      track_domain: config.dns.track_domain,
    };
  }, { detail: { tags: ['Domains'], summary: 'Get DNS setup instructions' } })

  // POST /org/:permalink/servers/:serverId/domains/:domainId/check — Check DNS
  .post('/servers/:serverId/domains/:domainId/check', async (c: any) => {
    const { getDb } = await import('../../index');
    const { DnsResolver } = await import('@posta/core');
    const db = await getDb();
    const domain = await db.get(`SELECT * FROM domains WHERE id = $1`, [c.params.domainId]) as any;
    if (!domain) { c.set.status = 404; return { error: 'DomainNotFound' }; }

    const domainName: string = domain.name;
    const selector = domain.dkim_identifier_string ?? 'posta';

    let resolver: InstanceType<typeof DnsResolver>;
    try {
      resolver = await DnsResolver.forDomain(domainName);
    } catch {
      // Fall back to local resolver if domain-specific lookup fails
      try {
        resolver = DnsResolver.local();
      } catch {
        c.set.status = 502;
        return { error: 'DnsResolverUnavailable', message: 'Unable to initialize DNS resolver' };
      }
    }

    // Check SPF (TXT record containing v=spf1)
    let spfStatus = 'Missing';
    let spfError: string | null = null;
    try {
      const txtRecords = await resolver.txt(domainName);
      const spfRecord = txtRecords.find((r) => r.toLowerCase().startsWith('v=spf1'));
      if (spfRecord) {
        spfStatus = 'OK';
      } else {
        spfStatus = 'Missing';
        spfError = 'No SPF record found';
      }
    } catch (err: any) {
      spfStatus = 'Error';
      spfError = err.message ?? 'DNS lookup failed';
    }

    // Check DKIM (TXT record at selector._domainkey.domain)
    let dkimStatus = 'Missing';
    let dkimError: string | null = null;
    try {
      const dkimHost = `${selector}._domainkey.${domainName}`;
      const dkimRecords = await resolver.txt(dkimHost);
      if (dkimRecords.length > 0) {
        dkimStatus = 'OK';
      } else {
        dkimStatus = 'Missing';
        dkimError = `No DKIM record found at ${dkimHost}`;
      }
    } catch (err: any) {
      dkimStatus = 'Error';
      dkimError = err.message ?? 'DNS lookup failed';
    }

    // Check MX records
    let mxStatus = 'Missing';
    let mxError: string | null = null;
    try {
      const mxRecords = await resolver.mx(domainName);
      if (mxRecords.length > 0) {
        mxStatus = 'OK';
      } else {
        mxStatus = 'Missing';
        mxError = 'No MX records found';
      }
    } catch (err: any) {
      mxStatus = 'Error';
      mxError = err.message ?? 'DNS lookup failed';
    }

    // Check return path (TXT record at rp.posta.domain or similar)
    let returnPathStatus = 'Missing';
    let returnPathError: string | null = null;
    try {
      const rpHost = `rp.posta.${domainName}`;
      const rpRecords = await resolver.txt(rpHost);
      if (rpRecords.length > 0) {
        returnPathStatus = 'OK';
      } else {
        returnPathStatus = 'Missing';
        returnPathError = `No return path record found at ${rpHost}`;
      }
    } catch (err: any) {
      returnPathStatus = 'Error';
      returnPathError = err.message ?? 'DNS lookup failed';
    }

    // Persist results
    await db.run(`
      UPDATE domains SET
        dns_checked_at = NOW(),
        spf_status = $1, spf_error = $2,
        dkim_status = $3, dkim_error = $4,
        mx_status = $5, mx_error = $6,
        return_path_status = $7, return_path_error = $8
      WHERE id = $9
    `, [
      spfStatus, spfError,
      dkimStatus, dkimError,
      mxStatus, mxError,
      returnPathStatus, returnPathError,
      c.params.domainId,
    ]);

    c.set.status = 200;
    return {
      spf_status: spfStatus,
      spf_error: spfError,
      dkim_status: dkimStatus,
      dkim_error: dkimError,
      mx_status: mxStatus,
      mx_error: mxError,
      return_path_status: returnPathStatus,
      return_path_error: returnPathError,
    };
  }, { detail: { tags: ['Domains'], summary: 'Check domain DNS records' } });
