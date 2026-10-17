import type { ReactNode } from "react";

/** Full-viewport stop for 404 / error boundaries: the counting-number
 *  treatment as hero, one serif sentence, one muted line, the app's buttons.
 *  Hook-free so both server (not-found) and client (error) routes can use it. */
export function StatusPage({
  code,
  title,
  body,
  actions,
}: {
  code: string;
  title: string;
  body: string;
  actions: ReactNode;
}) {
  return (
    <main className="po-status">
      <div className="po-digits po-status-code">{code}</div>
      <h1 className="po-status-title">{title}</h1>
      <p className="po-status-body">{body}</p>
      <div className="po-status-actions">{actions}</div>
    </main>
  );
}
