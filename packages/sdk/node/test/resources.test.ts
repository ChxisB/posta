import { describe, expect, it } from "vitest";
import type { ScoreBand } from "../src/index.js";
import { makeClient, pathOf } from "./helper.js";

describe("emails", () => {
  it("get and cancel hit the right paths", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.get("e1");
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/emails/e1" });
    await ms.emails.cancel("e1");
    expect(calls[1]).toMatchObject({ method: "POST", url: "https://api.test/emails/e1/cancel" });
  });

  it("get carries the score field, present or null", async () => {
    const { ms } = makeClient({ body: { object: "email", id: "e1", score: 7.5 } });
    const scored = await ms.emails.get("e1");
    expect(scored.data?.score).toBe(7.5);

    const { ms: unscored } = makeClient({ body: { object: "email", id: "e1", score: null } });
    const res = await unscored.emails.get("e1");
    expect(res.data?.score).toBeNull();
  });
});

describe("insights", () => {
  const fixture = {
    object: "email_insights",
    email_id: "6f1c9a1e-0000-4000-8000-000000000001",
    score: 8.5,
    score_version: 1,
    band: "excellent",
    marketing: true,
    html_size_bytes: 12345,
    computed_at: "2026-08-31T00:00:00.000Z",
    checks: [
      {
        id: "list_unsubscribe",
        severity: "major",
        status: "fail",
        penalty: 1.25,
        detail: { header: null, reason: "missing" },
      },
      { id: "plain_text_part", severity: "minor", status: "pass", penalty: 0 },
    ],
  };

  it("getInsights hits the path and returns the full report", async () => {
    const { ms, calls } = makeClient({ body: fixture });
    const res = await ms.emails.getInsights("e1");
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/emails/e1/insights" });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(fixture);
    expect(res.data?.checks[0]?.detail).toEqual({ header: null, reason: "missing" });
    expect(res.data?.checks[1]?.detail).toBeUndefined();
  });

  it("surfaces the 404 envelope when insights do not exist", async () => {
    const { ms } = makeClient({
      status: 404,
      body: { statusCode: 404, name: "not_found", message: "Email not found" },
    });
    const res = await ms.emails.getInsights("missing");
    expect(res.data).toBeNull();
    expect(res.error).toEqual({ statusCode: 404, name: "not_found", message: "Email not found" });
  });

  it("tolerates unknown future band/severity/status values (open sets)", async () => {
    const { ms } = makeClient({
      body: {
        ...fixture,
        band: "stellar",
        checks: [{ id: "brand_new_check", severity: "blocker", status: "deferred", penalty: 0 }],
      },
    });
    const res = await ms.emails.getInsights("e1");
    expect(res.error).toBeNull();
    expect(res.data?.band).toBe("stellar");
    expect(res.data?.checks[0]?.status).toBe("deferred");
    // Type-level half of the guarantee: a future value assigns without error.
    const future: ScoreBand = "stellar";
    expect(future).toBe("stellar");
  });
});

describe("deliverability", () => {
  const fixture = {
    object: "deliverability",
    score: 8.7,
    band: "good",
    content_score: 8.2,
    outcome_score: 9.1,
    complaint_rate: 0.0002,
    hard_bounce_rate: 0.001,
    emails_sent: 12345,
    scored_recipients: 23456,
    window_days: 30,
    insufficient_outcome_data: false,
    guardrail_status: "ok",
    score_version: 1,
  };

  it("get hits /deliverability and returns the report", async () => {
    const { ms, calls } = makeClient({ body: fixture });
    const res = await ms.deliverability.get();
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/deliverability" });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(fixture);
  });

  it("passes through the null-score shape", async () => {
    const empty = {
      ...fixture,
      score: null,
      band: null,
      content_score: null,
      outcome_score: null,
      insufficient_outcome_data: true,
    };
    const { ms } = makeClient({ body: empty });
    const res = await ms.deliverability.get();
    expect(res.data).toEqual(empty);
    expect(res.data?.score).toBeNull();
    expect(res.data?.band).toBeNull();
  });
});

describe("batch", () => {
  it("sends an array body with an idempotency key", async () => {
    const { ms, calls } = makeClient({ body: { data: [{ id: "1" }, { id: "2" }] } });
    const res = await ms.batch.send(
      [
        { from: "a@x.dev", to: "b@x.dev", subject: "1", text: "one" },
        { from: "a@x.dev", to: "c@x.dev", subject: "2", text: "two" },
      ],
      { idempotencyKey: "batch-1" },
    );
    expect(pathOf(calls[0])).toBe("/emails/batch");
    expect(Array.isArray(calls[0]?.body)).toBe(true);
    expect(calls[0]?.body).toHaveLength(2);
    expect(calls[0]?.headers["Idempotency-Key"]).toBe("batch-1");
    expect(res.data?.data.length).toBe(2);
  });
});

describe("contacts", () => {
  it("creates at /contacts", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.create({ email: "c@x.dev", firstName: "Ada" });
    expect(pathOf(calls[0])).toBe("/contacts");
    expect(calls[0]?.body).toEqual({ email: "c@x.dev", first_name: "Ada" });
  });

  it("addresses by string id and by email", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.get("c1");
    expect(pathOf(calls[0])).toBe("/contacts/c1");
    await ms.contacts.get({ email: "c@x.dev" });
    expect(pathOf(calls[1])).toBe(`/contacts/${encodeURIComponent("c@x.dev")}`);
  });

  it("update sends only provided keys (null clears)", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.update({ id: "c1", firstName: null, unsubscribed: true });
    expect(calls[0]).toMatchObject({ method: "PATCH", url: "https://api.test/contacts/c1" });
    expect(calls[0]?.body).toEqual({ first_name: null, unsubscribed: true });
  });

  it("remove and list", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.remove({ email: "c@x.dev" });
    expect(calls[0]).toMatchObject({
      method: "DELETE",
      url: "https://api.test/contacts/c%40x.dev",
    });
    await ms.contacts.list({ after: "cur" });
    expect(pathOf(calls[1])).toBe("/contacts?after=cur");
  });

  it("remove sends ?erase=true only when asked", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.remove("c1", { erase: true });
    expect(calls[0]).toMatchObject({
      method: "DELETE",
      url: "https://api.test/contacts/c1?erase=true",
    });
    await ms.contacts.remove("c1", { erase: false });
    expect(pathOf(calls[1])).toBe("/contacts/c1");
  });

  it("topics.update patches /contacts/:id/topics with the bare array", async () => {
    const { ms, calls } = makeClient({ body: { id: "c1" } });
    await ms.contacts.topics.update({
      id: "c1",
      topics: [{ id: "t1", subscription: "opt_out" }],
    });
    expect(calls[0]).toMatchObject({ method: "PATCH", url: "https://api.test/contacts/c1/topics" });
    expect(calls[0]?.body).toEqual([{ id: "t1", subscription: "opt_out" }]);
  });

  it("topics.list gets /contacts/:email/topics (encoded) and decodes the list envelope", async () => {
    const list = {
      object: "list",
      has_more: false,
      data: [
        { id: "t1", name: "Insights", description: null, subscription: "opt_in", explicit: false },
        { id: "t2", name: "Deals", description: "Offers", subscription: "opt_out", explicit: true },
      ],
    };
    const { ms, calls } = makeClient({ body: list });
    const res = await ms.contacts.topics.list({ email: "c+1@x.dev" });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.test/contacts/c%2B1%40x.dev/topics",
      body: undefined,
    });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(list);
    expect(res.data?.data[1]?.explicit).toBe(true);

    await ms.contacts.topics.list({ id: "c1" });
    expect(pathOf(calls[1])).toBe("/contacts/c1/topics");
  });

  it("preferencesLink posts to /contacts/:id/preferences-link with no body, by id or email", async () => {
    const { ms, calls } = makeClient({
      body: { object: "preferences_link", contact: "c1", url: "https://app.test/unsubscribe/tok" },
    });
    const res = await ms.contacts.preferencesLink("c1");
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.test/contacts/c1/preferences-link",
      body: undefined,
    });
    expect(res.data?.url).toBe("https://app.test/unsubscribe/tok");
    await ms.contacts.preferencesLink({ email: "c+1@x.dev" });
    expect(pathOf(calls[1])).toBe("/contacts/c%2B1%40x.dev/preferences-link");
  });

  it("list passes include as a comma-separated facet list", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.list({ limit: 100, include: ["properties", "topics"] });
    expect(decodeURIComponent(pathOf(calls[0]))).toBe(
      "/contacts?limit=100&include=properties,topics",
    );
    await ms.contacts.list({ segmentId: "s1", include: ["topics"] });
    expect(decodeURIComponent(pathOf(calls[1]))).toBe("/segments/s1/contacts?include=topics");
  });

  it("batch.get posts ids and emails to /contacts/batch/get and returns the missing entries", async () => {
    const { ms, calls } = makeClient({
      body: {
        object: "list",
        data: [{ object: "contact", id: "c1", email: "a@x.dev" }],
        missing: [{ index: 1, email: "b@x.dev" }],
      },
    });
    const res = await ms.contacts.batch.get(["c1", { email: "b@x.dev" }], {
      include: ["properties", "topics"],
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/contacts/batch/get" });
    expect(calls[0]?.body).toEqual({
      contacts: [{ id: "c1" }, { email: "b@x.dev" }],
      include: ["properties", "topics"],
    });
    expect(res.data?.missing).toEqual([{ index: 1, email: "b@x.dev" }]);
    await ms.contacts.batch.get([{ id: "c2" }]);
    expect(calls[1]?.body).toEqual({ contacts: [{ id: "c2" }], include: undefined });
  });

  it("batch.remove posts ids or emails to /contacts/batch/remove", async () => {
    const { ms, calls } = makeClient({
      body: { data: [{ object: "contact", contact: "c1", deleted: true }] },
    });
    const res = await ms.contacts.batch.remove({ ids: ["c1", "c2"] });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.test/contacts/batch/remove",
    });
    expect(calls[0]?.body).toEqual({ ids: ["c1", "c2"] });
    expect(res.data?.data[0]).toEqual({ object: "contact", contact: "c1", deleted: true });
    await ms.contacts.batch.remove({ emails: ["a@x.dev"] });
    expect(calls[1]?.body).toEqual({ emails: ["a@x.dev"] });
    await ms.contacts.batch.remove({ emails: ["a@x.dev"], erase: true });
    expect(calls[2]?.body).toEqual({ emails: ["a@x.dev"], erase: true });
  });
});

describe("broadcasts", () => {
  it("covers the full lifecycle", async () => {
    const { ms, calls } = makeClient();
    await ms.broadcasts.create({
      segmentId: "s1",
      from: "a@x.dev",
      subject: "News",
      html: "<p>hi</p>",
    });
    expect(pathOf(calls[0])).toBe("/broadcasts");
    expect(calls[0]?.body).toEqual({
      segment_id: "s1",
      from: "a@x.dev",
      subject: "News",
      html: "<p>hi</p>",
    });
    await ms.broadcasts.get("b1");
    expect(pathOf(calls[1])).toBe("/broadcasts/b1");
    await ms.broadcasts.list();
    expect(pathOf(calls[2])).toBe("/broadcasts");
    await ms.broadcasts.update("b1", { subject: "New" });
    expect(calls[3]).toMatchObject({ method: "PATCH", url: "https://api.test/broadcasts/b1" });
    await ms.broadcasts.send("b1", { scheduledAt: "2999-01-01T00:00:00Z" });
    expect(pathOf(calls[4])).toBe("/broadcasts/b1/send");
    expect(calls[4]?.body).toEqual({ scheduled_at: "2999-01-01T00:00:00Z" });
    await ms.broadcasts.cancel("b1");
    expect(pathOf(calls[5])).toBe("/broadcasts/b1/cancel");
    await ms.broadcasts.remove("b1");
    expect(calls[6]?.method).toBe("DELETE");
  });
});

describe("topics", () => {
  it("covers create/get/list/remove", async () => {
    const list = { object: "list", data: [{ id: "t1", name: "Product" }], has_more: false };
    const { ms, calls } = makeClient({ body: list });
    await ms.topics.create({ name: "Product", defaultSubscription: "opt_in" });
    expect(calls[0]?.body).toEqual({ name: "Product", default_subscription: "opt_in" });
    await ms.topics.get("t1");
    expect(pathOf(calls[1])).toBe("/topics/t1");
    const listed = await ms.topics.list();
    expect(pathOf(calls[2])).toBe("/topics");
    expect(listed.data).toEqual(list);
    expect(listed.data?.has_more).toBe(false);
    await ms.topics.remove("t1");
    expect(calls[3]?.method).toBe("DELETE");
  });
});

describe("segments", () => {
  it("covers create/get/list/update/remove on /segments", async () => {
    const { ms, calls } = makeClient();
    const filter = { match: "all" as const, conditions: [{ field: "email", op: "is_set" }] };
    await ms.segments.create({ name: "Active", filter });
    expect(pathOf(calls[0])).toBe("/segments");
    expect(calls[0]?.body).toEqual({ name: "Active", filter });
    await ms.segments.get("s1");
    expect(pathOf(calls[1])).toBe("/segments/s1");
    await ms.segments.list({ before: "cur" });
    expect(pathOf(calls[2])).toBe("/segments?before=cur");
    await ms.segments.update("s1", { name: "Renamed" });
    expect(calls[3]).toMatchObject({ method: "PATCH", url: "https://api.test/segments/s1" });
    await ms.segments.remove("s1");
    expect(calls[4]?.method).toBe("DELETE");
  });
});

describe("emails: every field reaches the wire", () => {
  it("send puts the full payload on the wire, snake_cased, nothing dropped", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.send({
      from: "Acme <a@x.dev>",
      to: ["b@x.dev", "b2@x.dev"],
      subject: "s",
      html: "<p>h</p>",
      text: "h",
      cc: "c@x.dev",
      bcc: ["d@x.dev"],
      replyTo: ["r@x.dev"],
      scheduledAt: "2999-01-01T00:00:00Z",
      tags: [{ name: "campaign", value: "launch" }],
      topicId: "11111111-1111-4111-8111-111111111111",
      attachments: [
        {
          filename: "hi.txt",
          content: "aGk=",
          contentType: "text/plain",
          contentId: "hi-1",
          path: "https://x.dev/hi.txt",
        },
      ],
      headers: { "X-Entity-Ref-ID": "123" },
      template: { id: "tpl_1", variables: { name: "Ada" } },
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/emails" });
    expect(calls[0]?.body).toEqual({
      from: "Acme <a@x.dev>",
      to: ["b@x.dev", "b2@x.dev"],
      subject: "s",
      html: "<p>h</p>",
      text: "h",
      cc: "c@x.dev",
      bcc: ["d@x.dev"],
      reply_to: ["r@x.dev"],
      scheduled_at: "2999-01-01T00:00:00Z",
      tags: [{ name: "campaign", value: "launch" }],
      topic_id: "11111111-1111-4111-8111-111111111111",
      attachments: [
        {
          filename: "hi.txt",
          content: "aGk=",
          content_type: "text/plain",
          content_id: "hi-1",
          path: "https://x.dev/hi.txt",
        },
      ],
      headers: { "X-Entity-Ref-ID": "123" },
      template: { id: "tpl_1", variables: { name: "Ada" } },
    });
  });

  it("base64-encodes Buffer attachment content and passes topic_id null through", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.send({
      from: "a@x.dev",
      to: "b@x.dev",
      subject: "s",
      text: "t",
      topicId: null,
      attachments: [{ filename: "hi.txt", content: Buffer.from("hi") }],
    });
    expect(calls[0]?.body).toEqual({
      from: "a@x.dev",
      to: "b@x.dev",
      subject: "s",
      text: "t",
      topic_id: null,
      attachments: [{ filename: "hi.txt", content: "aGk=" }],
    });
  });

  it("list, update and remove hit the right paths", async () => {
    const { ms, calls } = makeClient({ body: { object: "list", data: [], has_more: false } });
    await ms.emails.list({ limit: 10, after: "e1" });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.test/emails?limit=10&after=e1",
    });
    await ms.emails.update({ id: "e1", scheduledAt: "2999-01-01T00:00:00Z" });
    expect(calls[1]).toMatchObject({ method: "PATCH", url: "https://api.test/emails/e1" });
    expect(calls[1]?.body).toEqual({ scheduled_at: "2999-01-01T00:00:00Z" });
    await ms.emails.remove("e1");
    expect(calls[2]).toMatchObject({ method: "DELETE", url: "https://api.test/emails/e1" });
    expect(calls[2]?.body).toBeUndefined();
  });
});

describe("batch validation", () => {
  const two = [
    { from: "a@x.dev", to: "b@x.dev", subject: "1", text: "one" },
    { from: "a@x.dev", to: "not-an-email", subject: "2", text: "two" },
  ];

  it("sends x-batch-validation and surfaces the permissive-mode errors", async () => {
    const { ms, calls } = makeClient({
      body: { data: [{ id: "1" }], errors: [{ index: 1, message: "to: invalid email" }] },
    });
    const res = await ms.batch.send(two, { batchValidation: "permissive", idempotencyKey: "b-1" });
    expect(calls[0]?.headers["x-batch-validation"]).toBe("permissive");
    expect(calls[0]?.headers["Idempotency-Key"]).toBe("b-1");
    expect(res.data?.data).toEqual([{ id: "1" }]);
    expect(res.data?.errors).toEqual([{ index: 1, message: "to: invalid email" }]);
  });

  it("omits the header when no mode is chosen (API default is strict)", async () => {
    const { ms, calls } = makeClient({ body: { data: [{ id: "1" }, { id: "2" }] } });
    const res = await ms.batch.create(two);
    expect(calls[0]?.headers["x-batch-validation"]).toBeUndefined();
    expect(res.data?.errors).toBeUndefined();
  });
});

describe("contacts: segments, topics and batch", () => {
  it("create passes segments and topics", async () => {
    const { ms, calls } = makeClient();
    await ms.contacts.create({
      email: "c@x.dev",
      firstName: "Ada",
      lastName: "L",
      unsubscribed: false,
      properties: { plan: "pro", seats: 3 },
      segments: [{ id: "s1" }],
      topics: [{ id: "t1", subscription: "opt_in" }],
    });
    expect(calls[0]?.body).toEqual({
      email: "c@x.dev",
      first_name: "Ada",
      last_name: "L",
      unsubscribed: false,
      properties: { plan: "pro", seats: 3 },
      segments: [{ id: "s1" }],
      topics: [{ id: "t1", subscription: "opt_in" }],
    });
  });

  it("batch.create sends on_conflict, the validation header and the mapped items", async () => {
    const response = {
      data: [{ object: "contact", index: 0, id: "c1", status: "created" }],
      counts: { created: 1, updated: 0, skipped: 0, failed: 1 },
      errors: [{ index: 1, message: "email: invalid" }],
    };
    const { ms, calls } = makeClient({ body: response });
    const res = await ms.contacts.batch.create(
      [
        { email: "a@x.dev", firstName: "A" },
        { email: "nope", topics: [{ id: "t1", subscription: "opt_out" }] },
      ],
      { onConflict: "upsert", batchValidation: "permissive" },
    );
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.test/contacts/batch?on_conflict=upsert",
    });
    expect(calls[0]?.headers["x-batch-validation"]).toBe("permissive");
    expect(calls[0]?.body).toEqual([
      { email: "a@x.dev", first_name: "A" },
      { email: "nope", topics: [{ id: "t1", subscription: "opt_out" }] },
    ]);
    expect(res.data).toEqual(response);
    expect(res.data?.counts.failed).toBe(1);
  });

  it("batch.create without options sends no query and no header", async () => {
    const { ms, calls } = makeClient({ body: { data: [], counts: {} } });
    await ms.contacts.batch.create([{ email: "a@x.dev" }]);
    expect(pathOf(calls[0])).toBe("/contacts/batch");
    expect(calls[0]?.headers["x-batch-validation"]).toBeUndefined();
  });

  it("segments.add/remove address the contact by email, id or contactId", async () => {
    const { ms, calls } = makeClient({ body: { id: "c1" } });
    await ms.contacts.segments.add({ id: "c1", segmentId: "s1" });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.test/contacts/c1/segments/s1",
    });
    expect(calls[0]?.body).toBeUndefined();
    await ms.contacts.segments.remove({ email: "c@x.dev", segmentId: "s1" });
    expect(calls[1]).toMatchObject({
      method: "DELETE",
      url: "https://api.test/contacts/c%40x.dev/segments/s1",
    });
    await ms.contacts.segments.add({ contactId: "c2", segmentId: "s1" });
    expect(pathOf(calls[2])).toBe("/contacts/c2/segments/s1");
  });

  it("list with segmentId reads /segments/:id/contacts", async () => {
    const { ms, calls } = makeClient({ body: { object: "list", data: [], has_more: false } });
    await ms.contacts.list({ segmentId: "s1", limit: 5 });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.test/segments/s1/contacts?limit=5",
    });
  });

  it("get returns the typed property objects the API sends", async () => {
    const { ms } = makeClient({
      body: {
        object: "contact",
        id: "c1",
        email: "c@x.dev",
        first_name: null,
        last_name: null,
        created_at: "2026-01-01T00:00:00.000Z",
        unsubscribed: false,
        properties: { plan: { type: "string", value: "pro" }, seats: { type: "number", value: 3 } },
      },
    });
    const res = await ms.contacts.get("c1");
    expect(res.data?.properties.plan).toEqual({ type: "string", value: "pro" });
    expect(res.data?.properties.seats).toEqual({ type: "number", value: 3 });
  });
});

describe("broadcasts: full body and null clears", () => {
  it("create sends preview_text, send and scheduled_at", async () => {
    const { ms, calls } = makeClient();
    await ms.broadcasts.create({
      name: "Launch",
      segmentId: "s1",
      from: "a@x.dev",
      subject: "News",
      html: "<p>hi</p>",
      text: "hi",
      replyTo: "r@x.dev",
      previewText: "Preheader",
      topicId: "t1",
      send: true,
      scheduledAt: "in 1 hour",
    });
    expect(calls[0]?.body).toEqual({
      name: "Launch",
      segment_id: "s1",
      from: "a@x.dev",
      subject: "News",
      html: "<p>hi</p>",
      text: "hi",
      reply_to: "r@x.dev",
      preview_text: "Preheader",
      topic_id: "t1",
      send: true,
      scheduled_at: "in 1 hour",
    });
  });

  it("update sends topic_id null to clear the topic", async () => {
    const { ms, calls } = makeClient();
    await ms.broadcasts.update("b1", { topicId: null, previewText: "p" });
    expect(calls[0]?.body).toEqual({ topic_id: null, preview_text: "p" });
  });
});

describe("topics: visibility and update", () => {
  it("create passes visibility; update patches /topics/:id", async () => {
    const { ms, calls } = makeClient();
    await ms.topics.create({
      name: "Product",
      defaultSubscription: "opt_in",
      visibility: "public",
    });
    expect(calls[0]?.body).toEqual({
      name: "Product",
      default_subscription: "opt_in",
      visibility: "public",
    });
    await ms.topics.update("t1", { name: "Renamed", visibility: "private" });
    expect(calls[1]).toMatchObject({ method: "PATCH", url: "https://api.test/topics/t1" });
    expect(calls[1]?.body).toEqual({ name: "Renamed", visibility: "private" });
  });
});

describe("suppressions", () => {
  it("add/create post the email and origin", async () => {
    const { ms, calls } = makeClient({ body: { object: "suppression", id: "sup1" } });
    await ms.suppressions.add({ email: "Bad@x.dev", origin: "manual" });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/suppressions" });
    expect(calls[0]?.body).toEqual({ email: "Bad@x.dev", origin: "manual" });
    await ms.suppressions.create({ email: "bad@x.dev" });
    expect(calls[1]?.body).toEqual({ email: "bad@x.dev" });
  });

  it("list filters by origin alongside the cursor", async () => {
    const { ms, calls } = makeClient({ body: { object: "list", data: [], has_more: false } });
    await ms.suppressions.list({ limit: 5, origin: "bounce" });
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.test/suppressions?limit=5&origin=bounce",
    });
    await ms.suppressions.list();
    expect(pathOf(calls[1])).toBe("/suppressions");
  });

  it("get and remove accept an id or an email", async () => {
    const { ms, calls } = makeClient();
    await ms.suppressions.get("sup1");
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/suppressions/sup1" });
    await ms.suppressions.remove("bad@x.dev");
    expect(calls[1]).toMatchObject({
      method: "DELETE",
      url: "https://api.test/suppressions/bad%40x.dev",
    });
  });

  it("batch.add and batch.remove post to the batch paths", async () => {
    const { ms, calls } = makeClient({ body: { data: [] } });
    await ms.suppressions.batch.add({ emails: ["a@x.dev", "b@x.dev"], origin: "unsubscribe" });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.test/suppressions/batch/add",
    });
    expect(calls[0]?.body).toEqual({ emails: ["a@x.dev", "b@x.dev"], origin: "unsubscribe" });
    await ms.suppressions.batch.remove({ ids: ["sup1"] });
    expect(calls[1]).toMatchObject({
      method: "POST",
      url: "https://api.test/suppressions/batch/remove",
    });
    expect(calls[1]?.body).toEqual({ ids: ["sup1"] });
    await ms.suppressions.batch.remove({ emails: ["a@x.dev"] });
    expect(calls[2]?.body).toEqual({ emails: ["a@x.dev"] });
  });
});

describe("domains", () => {
  it("create sends every field snake_cased", async () => {
    const { ms, calls } = makeClient();
    await ms.domains.create({
      name: "acme.dev",
      region: "us-east-1",
      customReturnPath: "bounce",
      openTracking: true,
      clickTracking: false,
      trackingSubdomain: "links",
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/domains" });
    expect(calls[0]?.body).toEqual({
      name: "acme.dev",
      region: "us-east-1",
      custom_return_path: "bounce",
      open_tracking: true,
      click_tracking: false,
      tracking_subdomain: "links",
    });
  });

  it("list, get, verify, update and remove", async () => {
    const { ms, calls } = makeClient();
    await ms.domains.list({ limit: 2 });
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/domains?limit=2" });
    await ms.domains.get("d1");
    expect(calls[1]).toMatchObject({ method: "GET", url: "https://api.test/domains/d1" });
    await ms.domains.verify("d1");
    expect(calls[2]).toMatchObject({ method: "POST", url: "https://api.test/domains/d1/verify" });
    await ms.domains.update({
      id: "d1",
      openTracking: true,
      clickTracking: true,
      trackingSubdomain: null,
      tls: "enforced",
      capabilities: { sending: "enabled" },
    });
    expect(calls[3]).toMatchObject({ method: "PATCH", url: "https://api.test/domains/d1" });
    expect(calls[3]?.body).toEqual({
      open_tracking: true,
      click_tracking: true,
      tracking_subdomain: null,
      tls: "enforced",
      capabilities: { sending: "enabled" },
    });
    await ms.domains.remove("d1");
    expect(calls[4]).toMatchObject({ method: "DELETE", url: "https://api.test/domains/d1" });
  });
});

describe("webhooks", () => {
  it("covers create/list/get/update/remove", async () => {
    const { ms, calls } = makeClient({
      body: { object: "webhook", id: "w1", signing_secret: "whsec_abc" },
    });
    const created = await ms.webhooks.create({
      endpoint: "https://x.dev/hook",
      events: ["email.sent", "email.bounced"],
      signingSecret: "whsec_abc",
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/webhooks" });
    expect(calls[0]?.body).toEqual({
      endpoint: "https://x.dev/hook",
      events: ["email.sent", "email.bounced"],
      signing_secret: "whsec_abc",
    });
    expect(created.data?.signing_secret).toBe("whsec_abc");
    await ms.webhooks.list({ after: "w0" });
    expect(calls[1]).toMatchObject({ method: "GET", url: "https://api.test/webhooks?after=w0" });
    const got = await ms.webhooks.get("w1");
    expect(calls[2]).toMatchObject({ method: "GET", url: "https://api.test/webhooks/w1" });
    expect(got.data?.signing_secret).toBe("whsec_abc");
    await ms.webhooks.update("w1", { status: "disabled", events: ["email.opened"] });
    expect(calls[3]).toMatchObject({ method: "PATCH", url: "https://api.test/webhooks/w1" });
    expect(calls[3]?.body).toEqual({ events: ["email.opened"], status: "disabled" });
    await ms.webhooks.remove("w1");
    expect(calls[4]).toMatchObject({ method: "DELETE", url: "https://api.test/webhooks/w1" });
  });

  it("rotate posts to /webhooks/:id/rotate, sending {} when no option is given", async () => {
    const { ms, calls } = makeClient({
      body: {
        object: "webhook",
        id: "w1",
        signing_secret: "whsec_new",
        previous_secret_expires_at: "2026-01-02T00:00:00.000Z",
      },
    });
    const res = await ms.webhooks.rotate("w1");
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/webhooks/w1/rotate" });
    expect(calls[0]?.body).toEqual({});
    expect(res.data?.signing_secret).toBe("whsec_new");
    expect(res.data?.previous_secret_expires_at).toBe("2026-01-02T00:00:00.000Z");
    await ms.webhooks.rotate("w1", { signingSecret: "whsec_mine", overlapHours: 0 });
    expect(calls[1]?.body).toEqual({ signing_secret: "whsec_mine", overlap_hours: 0 });
  });
});

describe("apiKeys", () => {
  it("create returns the token once; list and remove", async () => {
    const { ms, calls } = makeClient({ body: { id: "k1", token: "ms_secret" } });
    const res = await ms.apiKeys.create({
      name: "ci",
      permission: "sending_access",
      domainId: "d1",
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/api-keys" });
    expect(calls[0]?.body).toEqual({ name: "ci", permission: "sending_access", domain_id: "d1" });
    expect(res.data?.token).toBe("ms_secret");
    await ms.apiKeys.create({ name: "resend-shaped", domain_id: "d2" });
    expect(calls[1]?.body).toEqual({ name: "resend-shaped", domain_id: "d2" });
    await ms.apiKeys.list({ limit: 1 });
    expect(calls[2]).toMatchObject({ method: "GET", url: "https://api.test/api-keys?limit=1" });
    await ms.apiKeys.remove("k1");
    expect(calls[3]).toMatchObject({ method: "DELETE", url: "https://api.test/api-keys/k1" });
  });
});

describe("templates", () => {
  it("create sends every field; null clears alias/subject/text on update", async () => {
    const { ms, calls } = makeClient({ body: { object: "template", id: "tp1" } });
    await ms.templates.create({
      name: "Welcome",
      html: "<p>Hi</p>",
      subject: "Welcome!",
      text: "Hi",
      alias: "welcome",
    });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/templates" });
    expect(calls[0]?.body).toEqual({
      name: "Welcome",
      html: "<p>Hi</p>",
      subject: "Welcome!",
      text: "Hi",
      alias: "welcome",
    });
    await ms.templates.update("welcome", {
      alias: null,
      subject: null,
      text: null,
      html: "<p>Yo</p>",
    });
    expect(calls[1]).toMatchObject({ method: "PATCH", url: "https://api.test/templates/welcome" });
    expect(calls[1]?.body).toEqual({ html: "<p>Yo</p>", subject: null, text: null, alias: null });
  });

  it("passes from/replyTo/variables through unchanged (the API decides)", async () => {
    const { ms, calls } = makeClient();
    await ms.templates.create({
      name: "n",
      html: "<p/>",
      from: "a@x.dev",
      replyTo: ["r@x.dev"],
      variables: [],
    });
    expect(calls[0]?.body).toEqual({
      name: "n",
      html: "<p/>",
      from: "a@x.dev",
      reply_to: ["r@x.dev"],
      variables: [],
    });
  });

  it("list, get by alias, publish, duplicate and remove", async () => {
    const { ms, calls } = makeClient();
    await ms.templates.list({ before: "tp0" });
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/templates?before=tp0" });
    await ms.templates.get("welcome");
    expect(calls[1]).toMatchObject({ method: "GET", url: "https://api.test/templates/welcome" });
    await ms.templates.publish("tp1");
    expect(calls[2]).toMatchObject({
      method: "POST",
      url: "https://api.test/templates/tp1/publish",
    });
    await ms.templates.duplicate("tp1");
    expect(calls[3]).toMatchObject({
      method: "POST",
      url: "https://api.test/templates/tp1/duplicate",
    });
    await ms.templates.remove("tp1");
    expect(calls[4]).toMatchObject({ method: "DELETE", url: "https://api.test/templates/tp1" });
  });
});

describe("contactProperties", () => {
  it("covers create/list/get/update/remove, with null clearing the fallback", async () => {
    const { ms, calls } = makeClient({ body: { object: "contact_property", id: "p1" } });
    await ms.contactProperties.create({ key: "plan", type: "string", fallbackValue: "free" });
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.test/contact-properties" });
    expect(calls[0]?.body).toEqual({ key: "plan", type: "string", fallback_value: "free" });
    await ms.contactProperties.list({ limit: 3 });
    expect(calls[1]).toMatchObject({
      method: "GET",
      url: "https://api.test/contact-properties?limit=3",
    });
    await ms.contactProperties.get("p1");
    expect(calls[2]).toMatchObject({
      method: "GET",
      url: "https://api.test/contact-properties/p1",
    });
    await ms.contactProperties.update({ id: "p1", fallbackValue: null });
    expect(calls[3]).toMatchObject({
      method: "PATCH",
      url: "https://api.test/contact-properties/p1",
    });
    expect(calls[3]?.body).toEqual({ fallback_value: null });
    await ms.contactProperties.remove("p1");
    expect(calls[4]).toMatchObject({
      method: "DELETE",
      url: "https://api.test/contact-properties/p1",
    });
  });
});

describe("usage", () => {
  it("get reads /usage and returns the report", async () => {
    const fixture = {
      object: "usage",
      cloud: true,
      plan: "pro",
      limits: { emails_per_day: 50000, domains: 10 },
      today: { emails_sent: 120, resets_at: "2026-09-05T00:00:00.000Z" },
      team: { id: "team1", name: "Acme" },
      app_url: "https://app.millionsend.com",
    };
    const { ms, calls } = makeClient({ body: fixture });
    const res = await ms.usage.get();
    expect(calls[0]).toMatchObject({ method: "GET", url: "https://api.test/usage" });
    expect(res.data).toEqual(fixture);
  });
});
