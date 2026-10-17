import type { ReactNode } from "react";

/** Keys match the tile renders in public/empty-states/<area>.webp (dark)
 * and public/empty-states/light/<area>.webp (light). */
export type EmptyStateArea =
  | "emails"
  | "broadcasts"
  | "templates"
  | "audience"
  | "metrics"
  | "domains"
  | "logs"
  | "api-keys"
  | "webhooks";

/**
 * Centered empty state: floating 3D app-icon tile render for the area,
 * "No X yet." headline, one-line explainer, optional CTA. Layout, depth
 * and motion live in components.css (.po-empty*).
 */
export function EmptyState({
  area,
  headline,
  body,
  cta,
}: {
  area: EmptyStateArea;
  headline: string;
  body?: ReactNode;
  cta?: ReactNode;
}) {
  return (
    <div className="po-card po-empty">
      <div className="po-empty-scene" aria-hidden="true">
        {/* Both theme variants stay in the DOM (each <20KB); the CSS
            po-dark-only/po-light-only swap makes the toggle instant. */}
        {/* biome-ignore lint/performance/noImgElement: tiny pre-sized webp tile, nothing for next/image to optimize */}
        <img
          className="po-empty-tile po-dark-only"
          src={`/empty-states/${area}.webp`}
          alt=""
          width={96}
          height={96}
        />
        {/* biome-ignore lint/performance/noImgElement: tiny pre-sized webp tile, nothing for next/image to optimize */}
        <img
          className="po-empty-tile po-light-only"
          src={`/empty-states/light/${area}.webp`}
          alt=""
          width={96}
          height={96}
        />
      </div>
      <p className="po-empty-headline">{headline}</p>
      {body ? <p className="po-empty-body">{body}</p> : null}
      {cta ? <div className="po-empty-cta">{cta}</div> : null}
    </div>
  );
}
