import type { ReactNode } from "react";

/* Shared t.rich tag map: <code> in message catalogs renders as an inline
   code pill. Keep <code> placement identical across languages. */
export const codeRichTags = {
  code: (chunks: ReactNode) => <code className="po-code">{chunks}</code>,
};
