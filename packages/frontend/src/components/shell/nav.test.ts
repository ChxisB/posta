import { describe, expect, it } from 'vitest';
import { FOOTER_ITEMS, isItemActive, navContextFromPath, navSections, type NavItem } from './nav';

const labels = (pathname: string) => navSections(navContextFromPath(pathname)).map((s) => s.label);

const find = (pathname: string, label: string): NavItem => {
  const item = navSections(navContextFromPath(pathname))
    .flatMap((s) => s.items)
    .find((i) => i.label === label);
  if (!item) throw new Error(`no nav item labelled ${label} at ${pathname}`);
  return item;
};

describe('navContextFromPath', () => {
  it('finds the organisation permalink', () => {
    expect(navContextFromPath('/organizations/acme')).toEqual({
      orgPermalink: 'acme',
      serverId: undefined,
    });
  });

  it('finds the server id nested under an organisation', () => {
    expect(navContextFromPath('/organizations/acme/servers/42/messages')).toEqual({
      orgPermalink: 'acme',
      serverId: '42',
    });
  });

  it('does not mistake the /organizations sub-routes for a permalink', () => {
    // /organizations/new and /organizations/setup are real routes; treating
    // either as a permalink would render an Organization section pointing at
    // /organizations/new/ip-pool-rules, which does not exist.
    expect(navContextFromPath('/organizations/new').orgPermalink).toBeUndefined();
    expect(navContextFromPath('/organizations/setup').orgPermalink).toBeUndefined();
  });

  it('finds nothing outside the organisation tree', () => {
    expect(navContextFromPath('/admin/users')).toEqual({
      orgPermalink: undefined,
      serverId: undefined,
    });
  });
});

describe('navSections', () => {
  it('shows only the always-present sections at the top level', () => {
    expect(labels('/admin/users')).toEqual(['Overview', 'Administration']);
  });

  it('grows an Organization section inside an organisation', () => {
    expect(labels('/organizations/acme')).toEqual(['Overview', 'Organization', 'Administration']);
  });

  it('grows a Server section inside a server', () => {
    expect(labels('/organizations/acme/servers/42/domains')).toEqual([
      'Overview',
      'Organization',
      'Server',
      'Administration',
    ]);
  });

  it('scopes every contextual link to the current organisation and server', () => {
    const path = '/organizations/acme/servers/42/domains';
    for (const item of navSections(navContextFromPath(path)).flatMap((s) => s.items)) {
      if (item.label === 'Messages')
        expect(item.href).toBe('/organizations/acme/servers/42/messages');
      if (item.label === 'IP pool rules')
        expect(item.href).toBe('/organizations/acme/ip-pool-rules');
    }
  });

  it('never emits a server link without a server', () => {
    const hrefs = navSections({ orgPermalink: 'acme' }).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs.some((h) => h.includes('/servers/undefined'))).toBe(false);
  });
});

describe('isItemActive', () => {
  it('marks Organizations active on its own route', () => {
    // Regression: the old item linked to "/" and tested `pathname === '/'`,
    // but "/" only ever redirects to /organizations, so it never lit up.
    expect(isItemActive(find('/organizations', 'Organizations'), '/organizations')).toBe(true);
  });

  it('does not mark an exact item active on its children', () => {
    const dashboard = find('/organizations/acme/servers/42', 'Dashboard');
    expect(isItemActive(dashboard, '/organizations/acme/servers/42')).toBe(true);
    expect(isItemActive(dashboard, '/organizations/acme/servers/42/messages')).toBe(false);
  });

  it('marks a section item active on its detail pages', () => {
    const messages = find('/organizations/acme/servers/42', 'Messages');
    expect(isItemActive(messages, '/organizations/acme/servers/42/messages/900')).toBe(true);
  });

  it('does not match a sibling route that merely shares a prefix', () => {
    const domains = find('/organizations/acme/servers/42', 'Domains');
    expect(isItemActive(domains, '/organizations/acme/servers/42/track-domains')).toBe(false);
  });

  it('ignores a query string on the href', () => {
    // Regression: a link of `${server}?tab=queue` was compared with
    // startsWith against a pathname, which never contains "?", so the item
    // could not be active on any route.
    const item: NavItem = {
      href: '/organizations/acme/servers/42?tab=queue',
      label: 'Queue',
      icon: FOOTER_ITEMS[0].icon,
    };
    expect(isItemActive(item, '/organizations/acme/servers/42')).toBe(true);
  });

  it('keeps the footer items addressable', () => {
    expect(FOOTER_ITEMS.map((i) => i.href)).toEqual(['/settings', '/help']);
    expect(isItemActive(FOOTER_ITEMS[0], '/settings')).toBe(true);
  });
});
