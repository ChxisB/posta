import { env } from "@posta/config";
import { getDb } from "@posta/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialogHost } from "@/components/confirm-dialog";
import { DeliverabilityBanner } from "@/components/deliverability-banner";
import { DemoBanner } from "@/components/demo-banner";
import { EventsHealthBanner } from "@/components/events-health-banner";
import { SupportViewBanner } from "@/components/support-view-banner";
import { TeamStandingBanner } from "@/components/team-standing-banner";
import { ToastHost } from "@/components/toast";
import { getAuth } from "@/server/auth";
import { isInstanceOperator } from "@/server/instance-operator";
import { ACTIVE_TEAM_COOKIE, getActiveMembership, listMemberships } from "@/server/membership";
import { resolveSupportView, SUPPORT_VIEW_COOKIE } from "@/server/support-view";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const db = getDb();
  const cookieStore = await cookies();
  // A live support view stands in for the membership: the shell shows the
  // viewed team under the banner, and the tRPC context resolves the same way.
  const view = await resolveSupportView(
    db,
    session.user.id,
    cookieStore.get(SUPPORT_VIEW_COOKIE)?.value,
  );
  const membership = view
    ? null
    : await getActiveMembership(db, session.user.id, cookieStore.get(ACTIVE_TEAM_COOKIE)?.value);
  const team = view ?? membership;
  if (!team) redirect("/onboarding");
  // The sample workspace says so on every page, and offers the way out.
  const demo = membership?.isDemo
    ? {
        backTeamId:
          (await listMemberships(db, session.user.id)).find((m) => !m.isDemo)?.teamId ?? null,
        canReset: !env.IS_CLOUD && (await isInstanceOperator(db, session.user.id)),
      }
    : null;

  return (
    <AppShell
      teamName={team.teamName}
      teamLogoUrl={team.logoUrl}
      userEmail={session.user.email}
      banner={
        view ? (
          <SupportViewBanner
            grantId={view.grantId}
            teamId={view.teamId}
            teamName={view.teamName}
            expiresAt={view.expiresAt}
          />
        ) : demo ? (
          <DemoBanner backTeamId={demo.backTeamId} canReset={demo.canReset} />
        ) : null
      }
    >
      {/* Canvas main-block padding: 32px 40px (DESIGN.md Layout); 16px below 900px. */}
      <main className="po-main" style={{ flex: 1, minWidth: 0, padding: "32px 40px" }}>
        <div className="po-main-col">
          <TeamStandingBanner />
          <EventsHealthBanner />
          <DeliverabilityBanner />
          {children}
        </div>
      </main>
      <ConfirmDialogHost />
      {/* The dashboard raises toasts too (a refused mutation under a support
          view, the Support access card); without a host they are dropped. */}
      <ToastHost />
    </AppShell>
  );
}
