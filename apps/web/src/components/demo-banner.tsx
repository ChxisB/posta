"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { BtnSpinner } from "@/components/spinner";
import { toast } from "@/components/toast";
import { useTRPC } from "@/lib/trpc";

/**
 * The strip over the sample workspace, on every page: nothing here is sent.
 * Reset (the instance operator's) re-seeds it; Back returns to the person's own team.
 */
export function DemoBanner({
  backTeamId,
  canReset,
}: {
  backTeamId: string | null;
  canReset: boolean;
}) {
  const t = useTranslations("common.demoBanner");
  const trpc = useTRPC();
  const reload = () => window.location.assign("/emails");
  const reset = useMutation(
    trpc.demo.load.mutationOptions({
      onSuccess: reload,
      onError: () => toast(t("resetFailed"), "danger"),
    }),
  );
  const back = useMutation(trpc.team.switch.mutationOptions({ onSuccess: reload }));

  // The sidebar drops by the strip's measured height, as under a support view.
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const measure = () =>
      root.style.setProperty("--po-support-strip-h", `${strip.current?.offsetHeight ?? 0}px`);
    measure();
    const observer = new ResizeObserver(measure);
    if (strip.current) observer.observe(strip.current);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--po-support-strip-h");
    };
  }, []);

  return (
    <div
      ref={strip}
      role="status"
      className="po-notice-strip po-notice-strip-info"
      style={{ margin: 0, borderRadius: 0, borderWidth: "0 0 1px" }}
    >
      <span className="po-notice-strip-text">{t("text")}</span>
      <span className="po-notice-strip-actions">
        {canReset ? (
          <button
            type="button"
            className="po-btn po-btn-secondary"
            disabled={reset.isPending}
            onClick={() => reset.mutate()}
          >
            <BtnSpinner on={reset.isPending} />
            {t("reset")}
          </button>
        ) : null}
        {backTeamId ? (
          <button
            type="button"
            className="po-btn po-btn-secondary"
            disabled={back.isPending}
            onClick={() => back.mutate({ teamId: backTeamId })}
          >
            <BtnSpinner on={back.isPending} />
            {t("back")}
          </button>
        ) : null}
      </span>
    </div>
  );
}
