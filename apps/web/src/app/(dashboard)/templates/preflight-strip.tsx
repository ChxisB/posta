"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { type PreflightAt, type PreflightIssue, preflightCounts } from "@/lib/preflight";

/** The id of the list the toggle opens, for `aria-controls`. */
export const PREFLIGHT_LIST_ID = "tpl-preflight-list";

type StripState = "checking" | "error" | "warn" | "clean";

function stripState(checking: boolean, errors: number, warnings: number): StripState {
  return checking ? "checking" : errors > 0 ? "error" : warnings > 0 ? "warn" : "clean";
}

/** Whether clicking an issue can take the person somewhere: a field or a node. */
function hasTarget(at: PreflightAt): boolean {
  return at.scope !== "email";
}

/** A 14px outline glyph in the current text colour, hidden from assistive tech. */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function StateIcon({ state }: { state: StripState }) {
  if (state === "error") {
    return (
      <Glyph>
        <circle cx="8" cy="8" r="6.2" />
        <path d="M8 4.8v3.8M8 11.1v.1" />
      </Glyph>
    );
  }
  if (state === "warn") {
    return (
      <Glyph>
        <path d="M8 2.2 14.2 13H1.8L8 2.2Z" />
        <path d="M8 6.6v3M8 11.5v.1" />
      </Glyph>
    );
  }
  if (state === "clean") {
    return (
      <Glyph>
        <circle cx="8" cy="8" r="6.2" />
        <path d="m5.2 8.2 2 2 3.6-4" />
      </Glyph>
    );
  }
  return (
    <Glyph>
      <circle cx="8" cy="8" r="6.2" strokeDasharray="3 3" />
    </Glyph>
  );
}

/** A key for a row: the same issue keeps its row between renders. */
function issueKey(issue: PreflightIssue): string {
  const place =
    issue.at.scope === "node"
      ? issue.at.path.join(".")
      : issue.at.scope === "theme"
        ? `theme.${issue.at.field}`
        : issue.at.scope;
  return [issue.messageKey, place, issue.params?.name ?? "", issue.context ?? ""].join(":");
}

function IssueRow({
  issue,
  onReveal,
}: {
  issue: PreflightIssue;
  onReveal: (at: PreflightAt) => void;
}) {
  const t = useTranslations("templates.preflight");
  const where = issue.at.scope === "node" ? issue.at.node : issue.at.scope;
  const severity = issue.severity === "error" ? "error" : "warning";
  const body = (
    <>
      <span className="po-pf-sev" data-severity={issue.severity}>
        <StateIcon state={issue.severity === "error" ? "error" : "warn"} />
        {t(severity)}
      </span>
      <span className="po-pf-where">{t(`where.${where}`)}</span>
      <span className="po-pf-msg">{t(`issue.${issue.messageKey}`, issue.params ?? {})}</span>
      {hasTarget(issue.at) ? <span className="po-pf-go">{t("show")}</span> : null}
      {issue.context ? (
        <span className="po-pf-ctx" dir="auto">
          {issue.context}
        </span>
      ) : null}
    </>
  );
  return hasTarget(issue.at) ? (
    <button type="button" className="po-pf-issue" onClick={() => onReveal(issue.at)}>
      {body}
    </button>
  ) : (
    <div className="po-pf-issue" data-static="">
      {body}
    </div>
  );
}

/**
 * The preflight strip: both counts, always, once the email is measured (until
 * then "Checking…", never a clean bill), and a list of what to fix that opens
 * on request. A row with a place in the email takes the person there. It is
 * advice only and never touches Save.
 */
export function PreflightStrip({
  issues,
  checking,
  htmlSource,
  onReveal,
  listId = PREFLIGHT_LIST_ID,
  defaultOpen = false,
}: {
  issues: readonly PreflightIssue[];
  /** No html has been rendered yet, so size and the like cannot be measured. */
  checking: boolean;
  /** An html-authored body: its links and images are not read, and the list says so. */
  htmlSource: boolean;
  onReveal: (at: PreflightAt) => void;
  /** The list's element id, so two strips on one page do not share it. */
  listId?: string;
  /** Starts with the list showing (a static render has no click to open it). */
  defaultOpen?: boolean;
}) {
  const t = useTranslations("templates.preflight");
  const [open, setOpen] = useState(defaultOpen);
  const { errors, warnings } = preflightCounts(issues);
  const state = stripState(checking, errors, warnings);
  const expanded = open && !checking;
  return (
    <section className="po-pf" data-state={state} aria-label={t("label")}>
      <div className="po-pf-bar">
        <span className="po-pf-state">
          <StateIcon state={state} />
        </span>
        <span className="po-pf-label">{t("label")}</span>
        <span className="po-pf-summary" role="status">
          {checking ? (
            t("checking")
          ) : (
            <>
              <span data-count="error" data-active={errors > 0 ? "" : undefined}>
                {t("errorCount", { count: errors })}
              </span>
              {", "}
              <span data-count="warn" data-active={warnings > 0 ? "" : undefined}>
                {t("warningCount", { count: warnings })}
              </span>
            </>
          )}
        </span>
        <button
          type="button"
          className="po-pf-toggle"
          aria-expanded={expanded}
          aria-controls={listId}
          disabled={checking}
          onClick={() => setOpen((value) => !value)}
        >
          {expanded ? t("hideDetails") : t("showDetails")}
        </button>
      </div>
      <div id={listId} className="po-pf-detail" hidden={!expanded}>
        {expanded ? (
          <>
            {issues.length === 0 ? (
              <p className="po-pf-none">{t("nothing")}</p>
            ) : (
              <ul className="po-pf-list">
                {issues.map((issue) => (
                  <li key={issueKey(issue)}>
                    <IssueRow issue={issue} onReveal={onReveal} />
                  </li>
                ))}
              </ul>
            )}
            {htmlSource ? <p className="po-pf-note">{t("codeNote")}</p> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
