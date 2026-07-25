
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import {
  LayoutDashboard, Globe, Server, Shield, Mail, Webhook,
  Network, Users, Settings, HelpCircle, Plus, Zap,
  Code2, Activity, BarChart3, X, Menu, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';
import { useState } from 'react';

interface SidebarProps {
  orgPermalink?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ orgPermalink, mobileOpen, onMobileClose }: SidebarProps) {
  const base = orgPermalink ? `/organizations/${orgPermalink}` : '';
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const serverId = pathname.match(/\/servers\/(\d+)/)?.[1];
  const serverBase = serverId ? `${base}/servers/${serverId}` : null;
  const onServerDashboard = !!serverId && !pathname.match(/\/servers\/\d+\//);

  const NavGroups = () => (
    <>
      <SidebarGroup title="Overview">
        <NavItem href="/" active={isActive('/') && pathname === '/'} icon={<LayoutDashboard className="h-4 w-4" />}>
          Dashboard
        </NavItem>
        <NavItem href="/organizations/setup" active={isActive('/organizations/setup')} icon={<Sparkles className="h-4 w-4" />}>
          Setup Wizard
        </NavItem>
      </SidebarGroup>

      {base && (
        <SidebarGroup title="Organization">
          <NavItem href={base} active={isActive(base) && !pathname.includes('/servers/')} icon={<Globe className="h-4 w-4" />}>
            Overview
          </NavItem>
          <NavItem href={`${base}/servers/new`} active={isActive(`${base}/servers/new`)} icon={<Plus className="h-4 w-4" />}>
            New Server
          </NavItem>
          <NavItem href={`${base}/ip-pool-rules`} active={isActive(`${base}/ip-pool-rules`)} icon={<Network className="h-4 w-4" />}>
            IP Pool Rules
          </NavItem>
        </SidebarGroup>
      )}

      {serverBase && (
        <SidebarGroup title="Server">
          <NavItem href={serverBase} active={onServerDashboard} icon={<Server className="h-4 w-4" />}>
            Dashboard
          </NavItem>
          <NavItem href={`${serverBase}/messages`} active={isActive(`${serverBase}/messages`)} icon={<Mail className="h-4 w-4" />}>
            Messages
          </NavItem>
          <NavItem href={`${serverBase}/domains`} active={isActive(`${serverBase}/domains`)} icon={<Globe className="h-4 w-4" />}>
            Domains
          </NavItem>
          <NavItem href={`${serverBase}/credentials`} active={isActive(`${serverBase}/credentials`)} icon={<Shield className="h-4 w-4" />}>
            Credentials
          </NavItem>
          <NavItem href={`${serverBase}/routes`} active={isActive(`${serverBase}/routes`)} icon={<Code2 className="h-4 w-4" />}>
            Routes
          </NavItem>
          <NavItem href={`${serverBase}/endpoints`} active={isActive(`${serverBase}/endpoints`)} icon={<Activity className="h-4 w-4" />}>
            Endpoints
          </NavItem>
          <NavItem href={`${serverBase}/webhooks`} active={isActive(`${serverBase}/webhooks`)} icon={<Webhook className="h-4 w-4" />}>
            Webhooks
          </NavItem>
          <NavItem href={`${serverBase}?tab=queue`} active={isActive(`${serverBase}?tab=queue`)} icon={<Zap className="h-4 w-4" />}>
            Queue
          </NavItem>
        </SidebarGroup>
      )}

      <SidebarGroup title="Administration">
        <NavItem href="/admin/users" active={isActive('/admin/users')} icon={<Users className="h-4 w-4" />}>
          Users
        </NavItem>
        <NavItem href="/admin/ip-pools" active={isActive('/admin/ip-pools')} icon={<BarChart3 className="h-4 w-4" />}>
          IP Pools
        </NavItem>
      </SidebarGroup>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-col w-64 border-r bg-sidebar/80 backdrop-blur-xl sticky top-0 h-screen overflow-y-auto z-20">
        <SidebarHeader />
        <nav className="flex-1 p-3 space-y-6">
          <NavGroups />
        </nav>
        <div className="p-3 border-t space-y-1">
          <NavItem href="/settings" active={isActive('/settings')} icon={<Settings className="h-4 w-4" />}>
            Settings
          </NavItem>
          <NavItem href="/help" active={isActive('/help')} icon={<HelpCircle className="h-4 w-4" />}>
            Help
          </NavItem>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onMobileClose} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar border-r shadow-2xl flex flex-col animate-slide-in-left">
            <div className="flex items-center justify-between p-4 border-b">
              <Brand />
              <button
                onClick={onMobileClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-6 overflow-y-auto">
              <NavGroups />
            </nav>
            <div className="p-3 border-t space-y-1">
              <NavItem href="/settings" active={isActive('/settings')} icon={<Settings className="h-4 w-4" />}>
                Settings
              </NavItem>
              <NavItem href="/help" active={isActive('/help')} icon={<HelpCircle className="h-4 w-4" />}>
                Help
              </NavItem>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SidebarHeader() {
  return (
    <div className="flex items-center justify-between p-4 border-b">
      <Brand />
      <div className="flex items-center gap-2">
        <ThemeToggle compact />
        <UserButton />
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm ring-1 ring-primary/20 group-hover:shadow-md transition-all">
        <Mail className="h-4 w-4" />
      </div>
      <span className="font-bold text-lg tracking-tight">Posta</span>
    </Link>
  );
}

function SidebarGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

function NavItem({ href, icon, children, active }: { href: string, icon: React.ReactNode, children: React.ReactNode, active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
        active
          ? "bg-primary/10 text-primary shadow-sm"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

export function MobileHeader({ orgPermalink, onMenuClick }: { orgPermalink?: string; onMenuClick: () => void }) {
  const pathname = usePathname();
  const title = pathname === '/organizations' || pathname === '/' ? 'Dashboard' :
    pathname.startsWith('/admin/users') ? 'Users' :
    pathname.startsWith('/admin/ip-pools') ? 'IP Pools' :
    pathname.startsWith('/settings') ? 'Settings' :
    pathname.startsWith('/help') ? 'Help' :
    pathname.startsWith('/organizations/new') ? 'New Organization' :
    'Dashboard';

  return (
    <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b bg-card/80 backdrop-blur-xl sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
            <Mail className="h-3.5 w-3.5" />
          </div>
          <span className="font-semibold tracking-tight">{title}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle compact />
        <UserButton />
      </div>
    </div>
  );
}
