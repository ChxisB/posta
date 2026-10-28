import type { ReactNode } from "react";

/**
 * Centered empty state: "No X yet." headline, one-line explainer, optional
 * CTA. Layout lives in components.css (.po-empty*).
 */
export function EmptyState({
  headline,
  body,
  cta,
}: {
  headline: string;
  body?: ReactNode;
  cta?: ReactNode;
}) {
  return (
    <div className="po-card po-empty">
      <p className="po-empty-headline">{headline}</p>
      {body ? <p className="po-empty-body">{body}</p> : null}
      {cta ? <div className="po-empty-cta">{cta}</div> : null}
    </div>
  );
}
