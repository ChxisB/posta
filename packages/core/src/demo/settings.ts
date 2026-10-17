import { schema } from "@posta/db";
import { eq } from "drizzle-orm";
import { type AuditAction, type AuditActor, auditRow } from "../audit.js";
import { clampToCap, DAY_MS, DEMO_USER_PREFIX, type DemoCtx } from "./context.js";
import type { Workspace } from "./workspace.js";

const TEAMMATES = [
  { name: "Priya Raman", email: "priya.raman@acme.test", role: "admin" as const, joined: 34 },
  { name: "Marcus Webb", email: "marcus.webb@acme.test", role: "member" as const, joined: 33 },
];

/** Teammates, a pending invitation and the audit trail of how the workspace got here. */
export async function seedSettings(ctx: DemoCtx, ws: Workspace) {
  const { db, teamId, ownerUserId, now } = ctx;
  const ago = (days: number, hours = 0) =>
    clampToCap(ctx, now.getTime() - days * DAY_MS - hours * 3_600_000);

  const mates = TEAMMATES.map((m, i) => ({ ...m, id: `${DEMO_USER_PREFIX}${i + 1}` }));
  await db.insert(schema.user).values(
    mates.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      emailVerified: true,
      createdAt: ago(m.joined + 1),
      updatedAt: ago(m.joined + 1),
    })),
  );
  await db
    .insert(schema.teamMembers)
    .values(mates.map((m) => ({ teamId, userId: m.id, role: m.role, createdAt: ago(m.joined) })));
  await db.insert(schema.teamInvitations).values({
    teamId,
    email: "jordan.lee@acme.test",
    role: "member",
    invitedByUserId: ownerUserId,
    expiresAt: new Date(now.getTime() + 6 * DAY_MS),
    lastSentAt: ago(1),
    sendCount: 1,
    createdAt: ago(1),
  });

  // audit_log is append-only, so a reset cannot clear it: seed it once per team id.
  const [existing] = await db
    .select({ id: schema.auditLog.id })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.teamId, teamId))
    .limit(1);
  if (existing) return;

  const owner = { userId: ownerUserId };
  const priya = { userId: `${DEMO_USER_PREFIX}1` };
  const marcus = { userId: `${DEMO_USER_PREFIX}2` };
  const rows: [
    number,
    AuditActor,
    AuditAction,
    [string, string] | undefined,
    Record<string, unknown>,
  ][] = [
    [45, owner, "team.created", ["team", teamId], { name: "Demo" }],
    [44, owner, "domain.created", ["domain", ws.verifiedDomainId], { name: "mail.acme.test" }],
    [44, owner, "domain.verified", ["domain", ws.verifiedDomainId], { name: "mail.acme.test" }],
    [40, owner, "api_key.created", ["api_key", ws.apiKeyIds.production], { name: "Production" }],
    [38, owner, "api_key.created", ["api_key", ws.apiKeyIds.backend], { name: "Backend jobs" }],
    [35, owner, "member.invited", undefined, { email: "priya.raman@acme.test", role: "admin" }],
    [35, owner, "member.invited", undefined, { email: "marcus.webb@acme.test", role: "member" }],
    [34, priya, "member.joined", ["user", priya.userId], { role: "admin" }],
    [33, marcus, "member.joined", ["user", marcus.userId], { role: "member" }],
    [
      30,
      owner,
      "domain.receiving_enabled",
      ["domain", ws.verifiedDomainId],
      { name: "mail.acme.test" },
    ],
    [28, owner, "member.role_changed", ["user", priya.userId], { from: "member", to: "admin" }],
    [25, priya, "api_key.renamed", ["api_key", ws.apiKeyIds.backend], { name: "Backend jobs" }],
    [20, owner, "inbox.created", undefined, { address: "support@mail.acme.test" }],
    [20, owner, "inbox.created", undefined, { address: "billing@mail.acme.test" }],
    [17, owner, "webhook.created", undefined, { url: "https://hooks.acme.test/posta" }],
    [17, priya, "webhook.created", undefined, { url: "https://staging.acme.test/webhooks/mail" }],
    [
      15,
      owner,
      "inbox.safety_updated",
      undefined,
      { address: "billing@mail.acme.test", field: "require_approval" },
    ],
    [12, owner, "api_key.revoked", undefined, { name: "Old integration" }],
    [8, owner, "webhook.updated", undefined, { url: "https://staging.acme.test/webhooks/mail" }],
    [3, owner, "domain.created", undefined, { name: "news.acme.test" }],
    [1, owner, "member.invited", undefined, { email: "jordan.lee@acme.test", role: "member" }],
  ];
  await db.insert(schema.auditLog).values(
    rows.map(([days, actor, action, target, metadata], i) => ({
      ...auditRow({
        teamId,
        actor,
        action,
        ...(target ? { target: { type: target[0], id: target[1] } } : {}),
        ...(metadata ? { metadata } : {}),
      }),
      createdAt: ago(days, i % 7),
    })),
  );
}
