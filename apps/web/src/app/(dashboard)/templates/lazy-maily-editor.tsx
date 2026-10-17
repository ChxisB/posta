"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/skeleton";

// Client-only: the Maily editor pulls in tiptap and touches the DOM, so it
// must not render on the server. The ghost holds the field's height meanwhile.
// One loader for the template editor's body and its convert probe.
export const MailyEditor = dynamic(
  () => import("@/components/maily-editor").then((m) => m.default),
  {
    ssr: false,
    loading: () => <Skeleton width="100%" height={340} radius="var(--po-r-input)" />,
  },
);
