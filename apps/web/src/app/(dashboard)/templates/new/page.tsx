import { NewTemplate } from "./new-template";

export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ starter?: string | string[] }>;
}) {
  const { starter } = await searchParams;
  return <NewTemplate starter={typeof starter === "string" ? starter : undefined} />;
}
