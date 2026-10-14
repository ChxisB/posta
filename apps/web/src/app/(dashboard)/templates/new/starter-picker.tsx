"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { PlusGlyph } from "@/components/icons/nav-icons";
import { Crumb, CrumbEnd, PageHeader } from "@/components/page-header";
import { type SketchRow, sketchOf } from "@/lib/starter-sketch";
import { BLANK_STARTER, type StarterTemplate } from "@/lib/starter-templates";

/** One row of a sketch: its widths are the same every time, so a card never shifts. */
function SketchBlock({ row }: { row: SketchRow }) {
  switch (row.kind) {
    case "heading":
      return <span className="po-sketch-heading" data-level={row.level} />;
    case "text":
      return (
        <span className="po-sketch-text">
          {Array.from({ length: row.lines }, (_, line) => line).map((line) => (
            <span key={line} className="po-sketch-line" data-last={line === row.lines - 1} />
          ))}
        </span>
      );
    case "list":
      return (
        <span className="po-sketch-list">
          {Array.from({ length: row.items }, (_, item) => item).map((item) => (
            <span key={item} className="po-sketch-item">
              <span className="po-sketch-dot" />
              <span className="po-sketch-line" />
            </span>
          ))}
        </span>
      );
    case "quote":
      return <span className="po-sketch-quote" />;
    case "button":
      return <span className="po-sketch-button" />;
    case "divider":
      return <span className="po-sketch-divider" />;
  }
}

/** The shape of an email, drawn small: decoration only, the card's text says what it is. */
export function StarterSketch({ document }: { document: unknown }) {
  const rows = sketchOf(document);
  return (
    <span className="po-sketch" aria-hidden="true">
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a sketch is a fixed drawing, position is identity
        <SketchBlock key={index} row={row} />
      ))}
    </span>
  );
}

/** "New template": the starting points, each a link to the editor begun from it. */
export function StarterPicker({ starters }: { starters: readonly StarterTemplate[] }) {
  const t = useTranslations("templates");
  const ts = useTranslations("templates.starters");
  return (
    <>
      <PageHeader
        breadcrumb={
          <>
            <Crumb href="/templates" label={t("editor.back")} />
            <CrumbEnd label={t("editor.newTitle")} />
          </>
        }
        title={t("editor.newTitle")}
        subtitle={ts("picker.hint")}
      />
      <ul className="po-starters" aria-label={ts("picker.listLabel")}>
        <li className="po-starter-item">
          <Link
            className="po-starter po-starter-blank"
            href={`/templates/new?starter=${BLANK_STARTER}`}
          >
            <span className="po-starter-preview" aria-hidden="true">
              <PlusGlyph size={20} />
            </span>
            <span className="po-starter-name">{ts("picker.blank")}</span>
            <span className="po-starter-desc">{ts("picker.blankHint")}</span>
          </Link>
        </li>
        {starters.map((starter) => (
          <li key={starter.id} className="po-starter-item">
            <Link className="po-starter" href={`/templates/new?starter=${starter.id}`}>
              <span className="po-starter-preview">
                <StarterSketch document={starter.document} />
              </span>
              <span className="po-starter-name">
                {starter.name}
                <span className="po-starter-kind">{ts(`picker.kind.${starter.kind}`)}</span>
              </span>
              <span className="po-starter-desc">{starter.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
