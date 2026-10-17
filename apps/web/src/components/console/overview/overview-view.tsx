"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/skeleton";
import { useTRPC } from "@/lib/trpc";
import { HealthCard, HealthPill } from "./health-card";
import { KpiCards } from "./kpi-cards";
import { MonitoringCard } from "./monitoring-card";
import { RegionsTable } from "./regions-table";
import { SentPerDay } from "./sent-per-day";
import { StatTiles } from "./stat-tiles";

const CARD = "var(--po-r-card)";

function Ghosts({ n, height }: { n: number; height: number }) {
  return Array.from({ length: n }, (_, i) => i).map((i) => (
    <Skeleton key={i} width="100%" height={height} radius={CARD} />
  ));
}

function OverviewSkeleton() {
  return (
    <>
      <div className="po-grid po-grid-4" style={{ marginBottom: 16 }}>
        <Ghosts n={4} height={190} />
      </div>
      <div className="po-grid po-grid-4" style={{ marginBottom: 16 }}>
        <Ghosts n={4} height={104} />
      </div>
      <div className="po-grid po-grid-21">
        <Ghosts n={2} height={340} />
      </div>
    </>
  );
}

export function OverviewView() {
  const t = useTranslations("console.overview");
  const common = useTranslations("console.common");
  const trpc = useTRPC();
  const summary = useQuery(trpc.console.overview.summary.queryOptions());
  const regions = useQuery(trpc.console.regions.list.queryOptions());
  const s = summary.data;

  const proof = s
    ? t("proof", {
        host: s.host ?? common("none"),
        version: s.version,
        serving: s.regions.serving,
        sandbox: s.regions.sandbox,
      }) +
      (s.regions.unreachable > 0 ? t("proofUnreachable", { count: s.regions.unreachable }) : "")
    : undefined;

  return (
    <>
      <PageHeader
        title={t("title")}
        {...(proof ? { subtitle: proof } : {})}
        badges={s ? <HealthPill summary={s} /> : null}
      />
      {summary.isError ? (
        <div className="po-card po-state">
          <span className="po-state-glyph" aria-hidden="true">
            !
          </span>
          <p className="po-state-headline">{common("loadError")}</p>
          <div className="po-state-actions">
            <button
              type="button"
              className="po-btn po-btn-secondary"
              onClick={() => summary.refetch()}
            >
              {common("retry")}
            </button>
          </div>
        </div>
      ) : !s ? (
        <OverviewSkeleton />
      ) : (
        <>
          <KpiCards />
          <StatTiles summary={s} />
          {regions.data ? (
            <RegionsTable
              list={regions.data}
              onChanged={() => {
                regions.refetch();
                summary.refetch();
              }}
            />
          ) : regions.isError ? (
            <div className="po-card po-state" style={{ marginBottom: 16 }}>
              <p className="po-state-headline">{common("loadError")}</p>
              <div className="po-state-actions">
                <button
                  type="button"
                  className="po-btn po-btn-secondary"
                  onClick={() => regions.refetch()}
                >
                  {common("retry")}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <Ghosts n={1} height={114} />
            </div>
          )}
          <div className="po-grid po-grid-21">
            <SentPerDay />
            <HealthCard summary={s} />
          </div>
          <MonitoringCard />
        </>
      )}
    </>
  );
}
