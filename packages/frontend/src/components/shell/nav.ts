import {
  Activity,
  BarChart3,
  Code2,
  Globe,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  Mail,
  Network,
  Plus,
  Server,
  Settings,
  Sparkles,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Path prefix that marks this item active, when it differs from `href`.
   * Needed wherever the link carries a query string, or points at an index
   * that owns a subtree.
   */
  match?: string;
  /** Marks this item active only on an exact path match. */
  exact?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export interface NavContext {
  /** Present once the operator is inside an organisation. */
  orgPermalink?: string;
  /** Present once they are inside one of that organisation's servers. */
  serverId?: string;
}

/**
 * Posta's navigation is contextual, which is the main way it differs from
 * Warden's flat constant: the "Organization" section only exists once you
 * are inside an organisation, and "Server" only once you are inside a
 * server. Building it as a pure function of the current route means the
 * shape is testable, instead of being spread across conditional JSX in the
 * sidebar where the previous two active-state bugs went unnoticed.
 */
export function navSections({ orgPermalink, serverId }: NavContext): NavSection[] {
  const org = orgPermalink ? `/organizations/${orgPermalink}` : null;
  const server = org && serverId ? `${org}/servers/${serverId}` : null;

  const sections: NavSection[] = [
    {
      label: 'Overview',
      items: [
        // Points at /organizations, not "/". The old item linked to "/",
        // which only ever redirects here, so the active check
        // (`pathname === '/'`) could never be true and Dashboard never
        // highlighted.
        { href: '/organizations', label: 'Organizations', icon: LayoutDashboard, exact: true },
        { href: '/organizations/setup', label: 'Setup wizard', icon: Sparkles },
      ],
    },
  ];

  if (org) {
    sections.push({
      label: 'Organization',
      items: [
        { href: org, label: 'Overview', icon: Globe, exact: true },
        { href: `${org}/servers/new`, label: 'New server', icon: Plus },
        { href: `${org}/ip-pool-rules`, label: 'IP pool rules', icon: Network },
      ],
    });
  }

  if (server) {
    sections.push({
      label: 'Server',
      items: [
        { href: server, label: 'Dashboard', icon: Server, exact: true },
        { href: `${server}/messages`, label: 'Messages', icon: Mail },
        { href: `${server}/domains`, label: 'Domains', icon: Globe },
        { href: `${server}/credentials`, label: 'Credentials', icon: KeyRound },
        { href: `${server}/routes`, label: 'Routes', icon: Code2 },
        { href: `${server}/endpoints`, label: 'Endpoints', icon: Activity },
        { href: `${server}/webhooks`, label: 'Webhooks', icon: Webhook },
        { href: `${server}/track-domains`, label: 'Tracking', icon: BarChart3 },
      ],
    });
  }

  sections.push({
    label: 'Administration',
    items: [
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/ip-pools', label: 'IP pools', icon: Network },
    ],
  });

  return sections;
}

/** The two items pinned to the foot of the rail, outside the sections. */
export const FOOTER_ITEMS: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/help', label: 'Help', icon: HelpCircle },
];

/**
 * Reads the organisation and server out of the current path, so the sidebar
 * does not have to be handed them by every layout that renders it.
 */
export function navContextFromPath(pathname: string): NavContext {
  const org = pathname.match(/^\/organizations\/([^/]+)/);
  const server = pathname.match(/\/servers\/(\d+)/);
  // "new" and "setup" are routes under /organizations, not permalinks.
  const permalink = org && !['new', 'setup'].includes(org[1]) ? org[1] : undefined;
  return { orgPermalink: permalink, serverId: server?.[1] };
}

/**
 * Whether `item` is the section of the app the operator is currently in.
 *
 * `exact` exists for index routes that have children: the server dashboard
 * lives at the same path that prefixes every server sub-page, so a plain
 * prefix test would light up Dashboard on all eight of them.
 */
export function isItemActive(item: NavItem, pathname: string): boolean {
  // Strip any query string: `pathname` never contains one, so an href that
  // does could otherwise never match. The old "Queue" item linked to
  // `${serverBase}?tab=queue` and was compared with startsWith against a
  // bare pathname, so it was permanently inactive.
  const target = (item.match ?? item.href).split('?')[0];
  if (item.exact) return pathname === target;
  return pathname === target || pathname.startsWith(`${target}/`);
}
