"use client";
import { Tab, Tabs, TabsList, TabsTrigger } from "fumadocs-ui/components/tabs";
import type { ReactNode } from "react";

export type Deployment = "cloud" | "self-hosted";

// Tab values are locale-independent so the persisted choice (localStorage key
// "deployment") carries across pages; only labels would localize.
const LABELS: Record<Deployment, string> = { cloud: "Cloud", "self-hosted": "Self-hosted" };

export function DeploymentTabs({ children }: { children: ReactNode }) {
  return (
    <Tabs groupId="deployment" persist defaultValue="cloud">
      <TabsList>
        <TabsTrigger value="cloud">{LABELS.cloud}</TabsTrigger>
        <TabsTrigger value="self-hosted">{LABELS["self-hosted"]}</TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  );
}

export function DeploymentTab({
  deployment,
  children,
}: {
  deployment: Deployment;
  children: ReactNode;
}) {
  return <Tab value={deployment}>{children}</Tab>;
}
