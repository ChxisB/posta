import { Elysia, t } from 'elysia';
import { DnsResolver, type PostaConfig, type Queryable } from '@posta/core';
import {
  INBOUND_SMTP, awsSettings, checkSesDomain, getSesService, inboundMxHost, inboundSettings, normalizeDomain, requireServedRegion,
  resolveInboundRegion, sesDnsRecords, type SesDomain, type SesService,
} from '@posta/aws';

interface Dependencies { db: Queryable; config: PostaConfig; ses?: SesService; resolver?: Pick<DnsResolver, 'txt' | 'mx'> }
const body = t.Object({ name: t.String(), region: t.Optional(t.String()), inbound_region: t.Optional(t.String()),
  incoming: t.Optional(t.Boolean()), outgoing: t.Optional(t.Boolean()) });
const safeDomain = (domain: any) => {
  const { dkim_private_key, ...publicDomain } = domain;
  return { ...publicDomain, region: domain.ses_region ?? null, inbound_region: domain.ses_inbound_region ?? null };
};

export function createDomainRoutes(deps?: Dependencies) {
  const context = async () => {
    if (deps) return { ...deps, ses: deps.ses ?? getSesService(deps.config) };
    const { getDb, getConfig } = await import('../../index');
    const config = await getConfig();
    return { db: await getDb(), config, ses: getSesService(config) };
  };
  const domainFor = async (c: any): Promise<SesDomain | undefined> => {
    const { db } = await context();
    return db.get<SesDomain>(`SELECT * FROM domains WHERE id = $1 AND server_id = $2`,
      [c.params.domainId, c.params.serverId]);
  };
  const check = async (c: any) => {
    const { db, config, ses } = await context();
    const domain = await domainFor(c);
    if (!domain) { c.set.status = 404; return { error: 'DomainNotFound' }; }
    if (domain.ses_region) {
      try { return await checkSesDomain(config, db, domain, ses, deps?.resolver); }
      catch (error: any) { c.set.status = 502; return { error: 'VerificationUnavailable', message: error.message }; }
    }
    // Legacy/inbound-only domains must actually prove control of their TXT token.
    const row = await db.get<any>(`SELECT verification_token FROM domains WHERE id = $1`, [domain.id]);
    const resolver = deps?.resolver ?? DnsResolver.local();
    let verified = false;
    let mxStatus = 'Missing';
    try {
      verified = (await resolver.txt(`${config.dns.domain_verify_prefix}.${domain.name}`)).includes(row.verification_token);
    } catch {}
    try {
      const mx = await resolver.mx(domain.name);
      mxStatus = config.dns.mx_records.every((expected) => mx.some((r) => r.exchange.replace(/\.$/, '') === expected.replace(/\.$/, ''))) ? 'OK' : 'Missing';
    } catch {}
    await db.run(`UPDATE domains SET verified_at = CASE WHEN $1 THEN COALESCE(verified_at, NOW()) ELSE NULL END,
      inbound_verified_at = CASE WHEN $1 THEN COALESCE(inbound_verified_at, NOW()) ELSE NULL END,
      mx_status = $2, dns_checked_at = NOW() WHERE id = $3`, [verified, mxStatus, domain.id]);
    return { verified, mx_status: mxStatus };
  };
  const create = async (c: any) => {
    const { db, config, ses } = await context();
    try {
      const name = normalizeDomain(c.body.name);
      const sending = c.body.outgoing !== false;
      const region = config.posta.delivery_provider === 'ses' && sending ? requireServedRegion(config, c.body.region) : null;
      const receiving = c.body.incoming !== false;
      if (c.body.inbound_region && c.body.inbound_region !== INBOUND_SMTP && (!region || !receiving)) throw new Error('inbound_region needs an incoming domain that sends through SES');
      const inboundRegion = region && receiving
        ? resolveInboundRegion(config, { requested: c.body.inbound_region, sendingRegion: region, served: awsSettings(config).regions })
        : null;
      const serverId = c.params.serverId ?? c.body.server_id ?? null;
      if (serverId && !await db.get(`SELECT id FROM servers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [serverId, c.org.id])) {
        c.set.status = 404; return { error: 'ServerNotFound' };
      }
      const domain = await db.transaction(async (tx) => {
        await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`ses-domain:${name}:${region}`]);
        const duplicate = await tx.get(`SELECT id FROM domains WHERE lower(name) = $1 AND (ses_region = $2 OR server_id = $3)`, [name, region, serverId]);
        if (duplicate) throw new Error('This domain already exists in that server or SES region');
        const identity = region ? await ses.provision(name, region, inboundRegion) : null;
        return tx.get<any>(`INSERT INTO domains (server_id, uuid, name, verification_token, owner_type, owner_id,
          ses_region, ses_inbound_region, ses_dkim_public_key, ses_dkim_selector, ses_mail_from_subdomain, incoming, outgoing, created_at, updated_at)
          VALUES ($1, $2, $3, $4, 'Organization', $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()) RETURNING *`,
          [serverId, crypto.randomUUID().replace(/-/g, ''), name, crypto.randomUUID().replace(/-/g, ''), c.org.id,
            region, inboundRegion, identity?.publicKey ?? null, identity?.selector ?? null, identity?.mailFromSubdomain ?? null,
            c.body.incoming === false ? 0 : 1, sending ? 1 : 0]);
      });
      c.set.status = 201;
      return { domain: safeDomain(domain) };
    } catch (error: any) {
      c.set.status = error.$metadata ? 502 : 400;
      return { error: 'DomainCreationFailed', message: error.message };
    }
  };

  return new Elysia({ prefix: '/org/:orgPermalink' })
    .onBeforeHandle(async (c: any) => {
      const { db } = await context();
      if (!c.user) { c.set.status = 401; return { error: 'Unauthorized' }; }
      const org = await db.get<any>(`SELECT * FROM organizations WHERE permalink = $1 AND deleted_at IS NULL`, [c.params.orgPermalink]);
      if (!org) { c.set.status = 404; return { error: 'OrganizationNotFound' }; }
      if (!c.user.admin && org.owner_id !== c.user.id && !await db.get(`SELECT id FROM organization_users WHERE organization_id = $1 AND user_id = $2`, [org.id, c.user.id])) {
        c.set.status = 403; return { error: 'OrganizationAccessDenied' };
      }
      c.org = org;
      if (c.params.serverId && !await db.get(`SELECT id FROM servers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [c.params.serverId, org.id])) {
        c.set.status = 404; return { error: 'ServerNotFound' };
      }
    })
    .get('/ses/regions', async () => {
      const { config, ses } = await context();
      const settings = awsSettings(config);
      const regions = config.posta.delivery_provider === 'ses' ? settings.regions : [];
      const inbound = inboundSettings(config);
      return { provider: config.posta.delivery_provider, default_region: regions[0] ?? null,
        inbound_provider: inbound.provider,
        // Only regions with an inbound bucket can receive mail; the rest fall back to Posta's SMTP MX.
        inbound_regions: inbound.provider === 'ses' ? regions.filter((region) => inbound.buckets[region]) : [],
        regions: await Promise.all(regions.map(async (region) => {
          try {
            const account = await ses.account(region);
            return { region, available: true, sandbox: !account.ProductionAccessEnabled,
              sending_enabled: account.SendingEnabled, quota: account.SendQuota };
          } catch (error: any) { return { region, available: false, message: error.message }; }
        })) };
    })
    .get('/domains', async (c: any) => {
      const { db } = await context();
      const domains = await db.query(`SELECT * FROM domains WHERE (owner_type = 'Organization' AND owner_id = $1)
        OR server_id IN (SELECT id FROM servers WHERE organization_id = $1)`, [c.org.id]);
      return { domains: domains.map(safeDomain) };
    })
    .post('/domains', create, { body: t.Object({ ...body.properties, server_id: t.Optional(t.Number()) }) })
    .get('/servers/:serverId/domains', async (c: any) => {
      const { db } = await context();
      return { domains: (await db.query(`SELECT * FROM domains WHERE server_id = $1`, [c.params.serverId])).map(safeDomain) };
    })
    .post('/servers/:serverId/domains', create, { body })
    .get('/servers/:serverId/domains/:domainId', async (c: any) => {
      const domain = await domainFor(c);
      if (!domain) { c.set.status = 404; return { error: 'DomainNotFound' }; }
      return { domain: safeDomain(domain) };
    })
    .patch('/servers/:serverId/domains/:domainId', async (c: any) => {
      const { db } = await context();
      const domain = await domainFor(c);
      if (!domain) { c.set.status = 404; return { error: 'DomainNotFound' }; }
      let name: string;
      try { name = c.body.name ? normalizeDomain(c.body.name) : domain.name; }
      catch (error: any) { c.set.status = 400; return { error: 'InvalidDomain', message: error.message }; }
      if ((domain.ses_region && c.body.name && name !== domain.name)
        || (c.body.region && c.body.region !== domain.ses_region)) {
        c.set.status = 409; return { error: 'IdentityImmutable', message: 'A domain keeps its SES region. Add a new domain to use a different region.' };
      }
      const updated = await db.get(`UPDATE domains SET incoming = $2, outgoing = $3,
        verified_at = CASE WHEN name <> $1 THEN NULL ELSE verified_at END,
        inbound_verified_at = CASE WHEN name <> $1 THEN NULL ELSE inbound_verified_at END,
        name = $1, updated_at = NOW()
        WHERE id = $4 AND server_id = $5 RETURNING *`,
        [name, c.body.incoming === undefined ? domain.incoming : Number(c.body.incoming),
          c.body.outgoing === undefined ? domain.outgoing : Number(c.body.outgoing), domain.id, c.params.serverId]);
      return { domain: safeDomain(updated) };
    }, { body: t.Partial(body) })
    .delete('/servers/:serverId/domains/:domainId', async (c: any) => {
      const { db } = await context();
      const domain = await domainFor(c);
      if (!domain) { c.set.status = 404; return { error: 'DomainNotFound' }; }
      // Leave AWS identity removal to the operator; historical events still resolve.
      await db.run(`DELETE FROM domains WHERE id = $1 AND server_id = $2`, [domain.id, c.params.serverId]);
      return { deleted: true };
    })
    .post('/servers/:serverId/domains/:domainId/provision', async (c: any) => {
      const { db, config, ses } = await context();
      if (config.posta.delivery_provider !== 'ses') { c.set.status = 409; return { error: 'SesDisabled' }; }
      try {
        const selected = requireServedRegion(config, c.body.region);
        const domain = await db.transaction(async (tx) => {
          const domain = await tx.get<SesDomain>(`SELECT * FROM domains WHERE id = $1 AND server_id = $2 FOR UPDATE`, [c.params.domainId, c.params.serverId]);
          if (!domain) throw new Error('Domain not found');
          if (domain.ses_region) {
            if (domain.ses_region !== selected) throw new Error('This domain is already assigned to another SES region');
            return domain;
          }
          await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`ses-domain:${domain.name}:${selected}`]);
          if (await tx.get(`SELECT id FROM domains WHERE lower(name) = $1 AND ses_region = $2 AND id <> $3`, [domain.name, selected, domain.id])) throw new Error('This domain already exists in that SES region');
          if (c.body.inbound_region && c.body.inbound_region !== INBOUND_SMTP && domain.incoming === 0) throw new Error('inbound_region needs a domain that receives mail');
          const inboundRegion = domain.incoming === 0 ? null
            : resolveInboundRegion(config, { requested: c.body.inbound_region, sendingRegion: selected, served: awsSettings(config).regions });
          const identity = await ses.provision(domain.name, selected, inboundRegion);
          return tx.get(`UPDATE domains SET ses_region = $1, ses_inbound_region = $2, ses_dkim_public_key = $3, ses_dkim_selector = $4,
            ses_mail_from_subdomain = $5, verified_at = NULL, dkim_status = NULL, spf_status = NULL,
            return_path_status = NULL, dns_checked_at = NULL, updated_at = NOW() WHERE id = $6 RETURNING *`,
            [selected, inboundRegion, identity.publicKey, identity.selector, identity.mailFromSubdomain, domain.id]);
        });
        return { domain: safeDomain(domain) };
      } catch (error: any) { c.set.status = error.$metadata ? 502 : 400; return { error: 'ProvisionFailed', message: error.message }; }
    }, { body: t.Object({ region: t.Optional(t.String()), inbound_region: t.Optional(t.String()) }) })
    .post('/servers/:serverId/domains/:domainId/verify', check)
    .post('/servers/:serverId/domains/:domainId/check', check)
    .get('/servers/:serverId/domains/:domainId/verify', async (c: any) => {
      const domain = await domainFor(c);
      if (!domain) { c.set.status = 404; return { error: 'DomainNotFound' }; }
      return { domain: { ...safeDomain(domain), verified: !!domain.verified_at } };
    })
    .get('/servers/:serverId/domains/:domainId/dns', async (c: any) => {
      const { config } = await context();
      const domain = await domainFor(c);
      if (!domain) { c.set.status = 404; return { error: 'DomainNotFound' }; }
      if (domain.ses_region) return { domain: domain.name, region: domain.ses_region, inbound_region: domain.ses_inbound_region ?? null,
        records: sesDnsRecords(config, domain), spf: 'v=spf1 include:amazonses.com ~all',
        dkim: `v=DKIM1; k=rsa; p=${domain.ses_dkim_public_key}`,
        mx: domain.ses_inbound_region ? inboundMxHost(domain.ses_inbound_region) : config.dns.mx_records.join(', '),
        return_path: `${domain.ses_mail_from_subdomain}.${domain.name}` };
      return { domain: domain.name, records: [
        { type: 'TXT', name: `${config.dns.domain_verify_prefix}.${domain.name}`, value: (domain as any).verification_token, purpose: 'verification' },
        ...config.dns.mx_records.map((value, i) => ({ type: 'MX', name: domain.name, value, priority: 10 + i * 10, purpose: 'mx' })),
      ], spf: `v=spf1 include:${config.dns.spf_include} ~all`,
        dkim: `${config.dns.dkim_identifier}._domainkey.${domain.name}`, mx: config.dns.mx_records.join(', '),
        return_path: config.dns.return_path_domain, verification_token: (domain as any).verification_token };
    });
}

export const domainRoutes = createDomainRoutes();
