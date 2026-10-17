import { receivingEnabled } from "@posta/config";
import { notFound } from "next/navigation";
import { InboxView } from "./inbox-view";

export default function InboxPage() {
  if (!receivingEnabled()) notFound();
  return <InboxView />;
}
