import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { PgClient, closeAllDatabases, initializeMainDb, loadConfig, type PostaConfig } from '@posta/core';
import { SesService } from '@posta/aws';
import { createDomainRoutes } from '../routes/org/domains.routes';

const url = 'postgresql://postgres:postgres@localhost:5432';
const database = `posta_test_ses_domains_${Date.now()}`;
let config: PostaConfig;
let db: PgClient;
let app: any;
let serverId: number;
let foreignServer: number;
let domainId: number;
let user = { id: 7, admin: false };
const identityCalls: Array<{ region: string; command: any }> = [];

async function request(path: string, method = 'GET', data?: any) {
  const response = await app.handle(new Request(`http://localhost/org/acme${path}`, {
    method, ...(data !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
  }));
  return { response, body: await response.json() as any };
}

beforeAll(async () => {
  const admin = new PgClient(`${url}/postgres`);
  await admin.exec(`CREATE DATABASE ${database}`); await admin.close();
  await closeAllDatabases();
  config = loadConfig('/dev/null');
  config.main_db.url = `${url}/${database}`; config.message_db.url = config.main_db.url;
  config.posta.delivery_provider = 'ses';
  config.aws = { region: 'us-east-1', regions: ['us-east-1', 'eu-west-1'], configuration_set: 'posta',
    sns_topic_arns: [], max_send_rate: 14, mail_from_subdomain: 'bounce', inbound_buckets: {}, inbound_prefix: 'inbound/' };
  db = await initializeMainDb(config);
  const org = await db.get<any>(`INSERT INTO organizations(uuid, name, permalink, owner_id) VALUES ($1, 'Acme', 'acme', 7) RETURNING id`, [crypto.randomUUID()]);
  const other = await db.get<any>(`INSERT INTO organizations(uuid, name, permalink, owner_id) VALUES ($1, 'Other', 'other', 8) RETURNING id`, [crypto.randomUUID()]);
  serverId = (await db.get<any>(`INSERT INTO servers(uuid, organization_id, name) VALUES ($1, $2, 'Mail') RETURNING id`, [crypto.randomUUID(), org.id])).id;
  foreignServer = (await db.get<any>(`INSERT INTO servers(uuid, organization_id, name) VALUES ($1, $2, 'Foreign') RETURNING id`, [crypto.randomUUID(), other.id])).id;
  const ses = new SesService(config, (region) => ({ async send(command) {
    identityCalls.push({ region, command });
    if (command.constructor.name === 'GetAccountCommand') return { SendingEnabled: true, ProductionAccessEnabled: region === 'us-east-1' };
    if (command.constructor.name === 'GetEmailIdentityCommand') return { VerifiedForSendingStatus: true,
      DkimAttributes: { Status: 'SUCCESS' }, MailFromAttributes: { MailFromDomainStatus: 'SUCCESS' } };
    return {};
  } }));
  app = new Elysia().derive({ as: 'global' }, () => ({ user })).use(createDomainRoutes({ db, config, ses,
    resolver: { async txt() { return []; }, async mx() { return []; } } }));
});
afterAll(async () => {
  await closeAllDatabases(); const admin = new PgClient(`${url}/postgres`);
  await admin.exec(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`); await admin.close();
});

describe('domain owners and SES regions', () => {
  it('offers served regions with their sandbox status to the organization owner', async () => {
    const result = await request('/ses/regions');
    expect(result.response.status).toBe(200);
    expect(result.body.default_region).toBe('us-east-1');
    expect(result.body.regions[1]).toMatchObject({ region: 'eu-west-1', sandbox: true });
  });
  it('creates a domain in the individually chosen region and hides private keys', async () => {
    const result = await request(`/servers/${serverId}/domains`, 'POST', { name: ' Example.TEST ', region: 'eu-west-1' });
    expect(result.response.status).toBe(201);
    domainId = result.body.domain.id;
    expect(result.body.domain).toMatchObject({ name: 'example.test', ses_region: 'eu-west-1', region: 'eu-west-1' });
    expect(result.body.domain).not.toHaveProperty('dkim_private_key');
    expect(result.body.domain.ses_dkim_public_key.length).toBeGreaterThan(300);
    expect(identityCalls.filter((c) => c.command.constructor.name === 'CreateEmailIdentityCommand')[0].region).toBe('eu-west-1');
  });
  it('rejects unserved regions before creating AWS identities', async () => {
    const before = identityCalls.length;
    const result = await request(`/servers/${serverId}/domains`, 'POST', { name: 'unserved.test', region: 'ap-south-1' });
    expect(result.response.status).toBe(400); expect(identityCalls.length).toBe(before);
  });
  it('never registers another organization\'s server or lets a nonmember access identities', async () => {
    expect((await request(`/servers/${foreignServer}/domains`, 'POST', { name: 'foreign.test' })).response.status).toBe(404);
    user = { id: 8, admin: false };
    expect((await request(`/servers/${serverId}/domains`)).response.status).toBe(403);
    user = { id: 7, admin: false };
  });
  it('prevents a region change or identity rename once the SES domain exists', async () => {
    expect((await request(`/servers/${serverId}/domains/${domainId}`, 'PATCH', { region: 'us-east-1' })).response.status).toBe(409);
    expect((await request(`/servers/${serverId}/domains/${domainId}`, 'PATCH', { name: 'different.test' })).response.status).toBe(409);
    expect((await db.get<any>('SELECT ses_region FROM domains WHERE id = $1', [domainId])).ses_region).toBe('eu-west-1');
  });
  it('shows distinct sending and inbound DNS records and never blindly marks a domain verified', async () => {
    const setup = await request(`/servers/${serverId}/domains/${domainId}/dns`);
    expect(setup.body.records.find((r: any) => r.purpose === 'return_path').value).toBe('feedback-smtp.eu-west-1.amazonses.com');
    expect(setup.body.records.filter((r: any) => r.purpose === 'mx').every((r: any) => r.name === 'example.test')).toBe(true);
    const result = await request(`/servers/${serverId}/domains/${domainId}/verify`, 'POST');
    expect(result.body.verified).toBe(false);
    expect((await db.get<any>('SELECT verified_at FROM domains WHERE id = $1', [domainId])).verified_at).toBeNull();
  });
  it('preserves legacy inbound ownership, DKIM keys and routes through SES conversion, and provisions idempotently', async () => {
    const legacy = await db.get<any>(`INSERT INTO domains(uuid, server_id, name, verified_at, dkim_private_key)
      VALUES ($1, $2, 'legacy.test', NOW(), 'legacy-private-key') RETURNING id`, [crypto.randomUUID(), serverId]);
    await db.run(`INSERT INTO routes(uuid, server_id, domain_id, name, mode) VALUES ($1, $2, $3, '*', 'Accept')`, [crypto.randomUUID(), serverId, legacy.id]);
    await initializeMainDb(config);
    expect((await db.get<any>('SELECT inbound_verified_at FROM domains WHERE id = $1', [legacy.id])).inbound_verified_at).not.toBeNull();
    const first = await request(`/servers/${serverId}/domains/${legacy.id}/provision`, 'POST', { region: 'us-east-1' });
    expect(first.response.status).toBe(200);
    const before = identityCalls.length;
    expect((await request(`/servers/${serverId}/domains/${legacy.id}/provision`, 'POST', { region: 'us-east-1' })).response.status).toBe(200);
    expect(identityCalls.length).toBe(before);
    const row = await db.get<any>('SELECT * FROM domains WHERE id = $1', [legacy.id]);
    expect(row.inbound_verified_at).not.toBeNull(); expect(row.dkim_private_key).toBe('legacy-private-key');
    expect(row.verified_at).toBeNull(); expect(row.ses_region).toBe('us-east-1');
    expect(await db.get('SELECT 1 FROM routes WHERE domain_id = $1', [legacy.id])).toBeDefined();
  });
  it('can register an inbound-only domain without making AWS calls', async () => {
    const before = identityCalls.length;
    const result = await request(`/servers/${serverId}/domains`, 'POST', { name: 'receive.test', outgoing: false });
    expect(result.response.status).toBe(201); expect(result.body.domain.ses_region).toBeNull();
    expect(identityCalls.length).toBe(before);
  });
});

describe('SES inbound regions', () => {
  const created = (name: string) => identityCalls.filter((c) => c.command.constructor.name === 'CreateEmailIdentityCommand'
    && c.command.input.EmailIdentity === name);
  const mxRecords = (body: any) => body.records.filter((r: any) => r.purpose === 'mx').map((r: any) => r.value);
  const buckets = (value: Record<string, string>) => { config.aws!.inbound_buckets = value; };
  afterAll(() => { buckets({}); config.posta.inbound_provider = 'ses'; });

  it('offers only the served regions that have an inbound bucket', async () => {
    expect((await request('/ses/regions')).body.inbound_regions).toEqual([]);
    buckets({ 'eu-west-1': 'posta-inbound-eu', 'ap-south-1': 'posta-inbound-unserved' });
    expect((await request('/ses/regions')).body.inbound_regions).toEqual(['eu-west-1']);
  });
  it('verifies a domain in a different receiving region with the same key and points its MX at SES there', async () => {
    buckets({ 'eu-west-1': 'posta-inbound-eu' });
    const result = await request(`/servers/${serverId}/domains`, 'POST', { name: 'split.test', region: 'us-east-1', inbound_region: 'eu-west-1' });
    expect(result.response.status).toBe(201);
    expect(result.body.domain).toMatchObject({ region: 'us-east-1', inbound_region: 'eu-west-1', ses_inbound_region: 'eu-west-1' });
    const identities = created('split.test');
    expect(identities.map((c) => c.region).sort()).toEqual(['eu-west-1', 'us-east-1']);
    expect(new Set(identities.map((c) => c.command.input.DkimSigningAttributes.DomainSigningPrivateKey)).size).toBe(1);

    const dns = await request(`/servers/${serverId}/domains/${result.body.domain.id}/dns`);
    expect(mxRecords(dns.body)).toEqual(['inbound-smtp.eu-west-1.amazonaws.com']);
    expect(dns.body).toMatchObject({ mx: 'inbound-smtp.eu-west-1.amazonaws.com', inbound_region: 'eu-west-1' });
    // Sending feedback still goes to the sending region.
    expect(dns.body.records.find((r: any) => r.purpose === 'return_path').value).toBe('feedback-smtp.us-east-1.amazonses.com');
  });
  it('receives in the sending region by default when that region has a bucket, with one identity', async () => {
    buckets({ 'us-east-1': 'posta-inbound-us' });
    const result = await request(`/servers/${serverId}/domains`, 'POST', { name: 'defaulted.test', region: 'us-east-1' });
    expect(result.response.status).toBe(201);
    expect(result.body.domain.inbound_region).toBe('us-east-1');
    expect(created('defaulted.test')).toHaveLength(1);
  });
  it('lets one domain stay on Posta\'s SMTP server although its region has a bucket', async () => {
    buckets({ 'us-east-1': 'posta-inbound-us' });
    const optOut = await request(`/servers/${serverId}/domains`, 'POST', { name: 'optout.test', region: 'us-east-1', inbound_region: 'smtp' });
    expect(optOut.response.status).toBe(201);
    expect(optOut.body.domain.inbound_region).toBeNull();
    expect(created('optout.test')).toHaveLength(1);
    const dns = await request(`/servers/${serverId}/domains/${optOut.body.domain.id}/dns`);
    expect(mxRecords(dns.body)).toEqual(config.dns.mx_records);

    const legacy = await db.get<any>(`INSERT INTO domains(uuid, server_id, name, verified_at) VALUES ($1, $2, 'legacy-optout.test', NOW()) RETURNING id`,
      [crypto.randomUUID(), serverId]);
    const provisioned = await request(`/servers/${serverId}/domains/${legacy.id}/provision`, 'POST', { region: 'us-east-1', inbound_region: 'smtp' });
    expect(provisioned.response.status).toBe(200);
    expect((await db.get<any>('SELECT ses_inbound_region FROM domains WHERE id = $1', [legacy.id])).ses_inbound_region).toBeNull();
  });
  it('keeps Posta\'s own SMTP MX for a region without an inbound bucket', async () => {
    buckets({ 'eu-west-1': 'posta-inbound-eu' });
    const result = await request(`/servers/${serverId}/domains`, 'POST', { name: 'smtp-mx.test', region: 'us-east-1' });
    expect(result.response.status).toBe(201);
    expect(result.body.domain.inbound_region).toBeNull();
    const dns = await request(`/servers/${serverId}/domains/${result.body.domain.id}/dns`);
    expect(mxRecords(dns.body)).toEqual(config.dns.mx_records);
  });
  it('refuses a receiving region that is not set up, or one for a domain that does not receive, before calling AWS', async () => {
    buckets({ 'eu-west-1': 'posta-inbound-eu' });
    const before = identityCalls.length;
    const noBucket = await request(`/servers/${serverId}/domains`, 'POST', { name: 'nobucket.test', region: 'us-east-1', inbound_region: 'us-east-1' });
    expect(noBucket.response.status).toBe(400);
    expect(noBucket.body.message).toContain('not set up');
    const sendOnly = await request(`/servers/${serverId}/domains`, 'POST', { name: 'sendonly.test', region: 'us-east-1', inbound_region: 'eu-west-1', incoming: false });
    expect(sendOnly.response.status).toBe(400);
    expect(identityCalls.length).toBe(before);
  });
  it('records the receiving region when an existing domain is provisioned for SES', async () => {
    buckets({ 'eu-west-1': 'posta-inbound-eu' });
    const legacy = await db.get<any>(`INSERT INTO domains(uuid, server_id, name, verified_at) VALUES ($1, $2, 'upgrade.test', NOW()) RETURNING id`,
      [crypto.randomUUID(), serverId]);
    const result = await request(`/servers/${serverId}/domains/${legacy.id}/provision`, 'POST', { region: 'us-east-1', inbound_region: 'eu-west-1' });
    expect(result.response.status).toBe(200);
    expect((await db.get<any>('SELECT ses_inbound_region FROM domains WHERE id = $1', [legacy.id])).ses_inbound_region).toBe('eu-west-1');
    expect(created('upgrade.test').map((c) => c.region).sort()).toEqual(['eu-west-1', 'us-east-1']);
  });
  it('never uses SES inbound when the install keeps it on Posta\'s SMTP server', async () => {
    buckets({ 'us-east-1': 'posta-inbound-us' });
    config.posta.inbound_provider = 'smtp';
    expect((await request('/ses/regions')).body.inbound_regions).toEqual([]);
    const result = await request(`/servers/${serverId}/domains`, 'POST', { name: 'smtp-only.test', region: 'us-east-1' });
    expect(result.body.domain.inbound_region).toBeNull();
    expect((await request(`/servers/${serverId}/domains`, 'POST', { name: 'asked.test', region: 'us-east-1', inbound_region: 'us-east-1' })).response.status).toBe(400);
    config.posta.inbound_provider = 'ses';
  });
});
