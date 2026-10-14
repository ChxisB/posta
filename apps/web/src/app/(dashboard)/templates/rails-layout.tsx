"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect } from "react";
import { FOCUSABLE } from "@/components/modal";
import type { RailSide } from "@/lib/template-rails";
import { useScrollLock } from "@/lib/use-scroll-lock";
import type { TemplateRails } from "./use-template-rails";

const SIDES: readonly RailSide[] = ["left", "right"];

/** The rail's element id, which a drawer's opener points at with `aria-controls`. */
export function railId(side: RailSide): string {
  return `po-tpl-rail-${side}`;
}

/** The toolbar button that opens a rail's drawer, and where focus goes back to. */
export function railOpenerId(side: RailSide): string {
  return `po-tpl-open-${side}`;
}

/** A 16px chevron: it points toward the edge the rail folds into. */
function Chevron({ toward }: { toward: "left" | "right" }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={toward === "left" ? "m10 3.5-4.5 4.5 4.5 4.5" : "m6 3.5 4.5 4.5-4.5 4.5"} />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

function Rail({
  side,
  title,
  rails,
  children,
}: {
  side: RailSide;
  title: string;
  rails: TemplateRails;
  children: ReactNode;
}) {
  const t = useTranslations("templates.rails");
  const mode = rails.modeOf(side);
  const shown = rails.shown(side);
  const folded = mode === "docked" && rails.state.collapsed[side];
  const isDrawer = rails.drawer === side;
  const id = railId(side);
  // A rail folds toward the edge it sits on.
  const edge = side;
  return (
    <aside
      id={id}
      className="po-tpl-rail"
      data-side={side}
      data-mode={mode}
      data-collapsed={folded || undefined}
      data-open={isDrawer || undefined}
      {...(isDrawer ? { role: "dialog", "aria-modal": true } : {})}
      aria-labelledby={`${id}-title`}
    >
      {/* Out of the tab order and the accessibility tree while it cannot be seen. */}
      <div className="po-tpl-rail-inner" inert={!shown}>
        <div className="po-tpl-rail-head">
          <h2 id={`${id}-title`} className="po-tpl-rail-title">
            {title}
          </h2>
          <button
            type="button"
            className="po-tpl-rail-btn"
            aria-label={
              mode === "docked" ? t("hide", { rail: title }) : t("close", { rail: title })
            }
            title={mode === "docked" ? t("hide", { rail: title }) : t("close", { rail: title })}
            onClick={() => (mode === "docked" ? rails.toggleCollapsed(side) : rails.close())}
          >
            {mode === "docked" ? <Chevron toward={edge} /> : <CloseGlyph />}
          </button>
        </div>
        <div className="po-tpl-rail-body">{children}</div>
      </div>
      {folded ? (
        <button
          type="button"
          className="po-tpl-rail-btn po-tpl-rail-expand"
          aria-label={t("show", { rail: title })}
          title={t("show", { rail: title })}
          onClick={() => rails.toggleCollapsed(side)}
        >
          <Chevron toward={edge === "left" ? "right" : "left"} />
        </button>
      ) : null}
    </aside>
  );
}

/**
 * The three zones of a block template's editor: the components rail on the
 * left, the email in the middle (`children`, with a toolbar over it that opens
 * a rail that has no room to sit beside it), the settings rail on the right.
 * What is beside the email and what is a drawer follows the layout's width
 * (see `railTier`); the layout holds no editor logic.
 */
export function RailsLayout({
  rails,
  titles,
  left,
  right,
  children,
}: {
  rails: TemplateRails;
  /** Each rail's name: its heading, its button and its landmark's name. */
  titles: Record<RailSide, string>;
  left: ReactNode;
  right: ReactNode;
  children: ReactNode;
}) {
  const { drawer, close, restoreFocus } = rails;
  useScrollLock(drawer !== null);

  // A drawer is a dialog while it is open: focus goes in, Tab stays in, Esc
  // closes it, and focus goes back to what opened it (unless the person went
  // on to use the email, which `close({ focus: false })` says).
  useEffect(() => {
    if (!drawer) return;
    const aside = document.getElementById(railId(drawer));
    const active = document.activeElement;
    const opener =
      active instanceof HTMLElement && active !== document.body && !aside?.contains(active)
        ? active
        : document.getElementById(railOpenerId(drawer));
    aside?.querySelector<HTMLElement>(".po-tpl-rail-btn")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !aside) return;
      const focusable = aside.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (restoreFocus.current) opener?.focus();
      restoreFocus.current = true;
    };
  }, [drawer, close, restoreFocus]);

  const openers = SIDES.filter((side) => rails.modeOf(side) === "drawer");
  return (
    <div
      ref={rails.ref}
      className="po-tpl-layout"
      data-tier={rails.tier}
      data-ready={rails.ready || undefined}
    >
      <div className="po-tpl-grid">
        <Rail side="left" title={titles.left} rails={rails}>
          {left}
        </Rail>
        <div className="po-tpl-canvas">
          {openers.length > 0 ? (
            <div className="po-tpl-bar">
              {openers.map((side) => (
                <button
                  key={side}
                  id={railOpenerId(side)}
                  type="button"
                  className="po-btn po-btn-sm"
                  aria-haspopup="dialog"
                  aria-expanded={rails.drawer === side}
                  aria-controls={railId(side)}
                  onClick={() => rails.openDrawer(side)}
                >
                  {titles[side]}
                </button>
              ))}
            </div>
          ) : null}
          {children}
        </div>
        <Rail side="right" title={titles.right} rails={rails}>
          {right}
        </Rail>
      </div>
      {drawer ? (
        // Click to dismiss; the keyboard's way out is the Esc listener above.
        <div className="po-tpl-scrim" aria-hidden="true" onClick={() => close()} />
      ) : null}
    </div>
  );
}
