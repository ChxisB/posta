"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoadError } from "@/components/load-error";
import { useTRPC } from "@/lib/trpc";
import { EditorSkeleton, TemplateEditor } from "../../editor";

export default function EditTemplatePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("templates");
  const trpc = useTRPC();

  const query = useQuery(trpc.templates.get.queryOptions({ id }, { retry: false }));
  const template = query.data;

  if (query.isError) {
    return (
      <LoadError
        error={query.error}
        headline={t("editor.error")}
        notFoundHeadline={t("editor.notFound")}
        onRetry={() => query.refetch()}
        backHref="/templates"
        backLabel={t("list.title")}
      />
    );
  }
  if (!template) return <EditorSkeleton />;
  if (template.hiddenBySupportView) {
    return (
      <p
        className="ms-card"
        style={{ padding: 24, margin: 0, color: "var(--ms-muted)", fontSize: "var(--ms-fs-ui)" }}
      >
        {t("editor.hiddenBySupportView")}
      </p>
    );
  }

  return (
    <TemplateEditor
      initial={{
        id: template.id,
        name: template.name,
        subject: template.subject,
        // Non-null past the support view check above.
        html: template.html ?? "",
        text: template.text,
        document: template.document,
      }}
    />
  );
}
