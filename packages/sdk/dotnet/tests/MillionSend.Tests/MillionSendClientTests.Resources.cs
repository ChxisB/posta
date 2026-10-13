using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Xunit;

namespace MillionSend.Tests;

// Wire-body completeness, PATCH null-clears, batch validation and the resources
// beyond emails/contacts/topics/broadcasts/segments.
public partial class MillionSendClientTests
{
    private static readonly Guid D1 = Guid.Parse("d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0");
    private static readonly Guid W1 = Guid.Parse("a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1");
    private static readonly Guid K1 = Guid.Parse("a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2");
    private static readonly Guid P1 = Guid.Parse("a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3");
    private static readonly Guid X1 = Guid.Parse("a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4");
    private static readonly Guid TP1 = Guid.Parse("a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5");

    private static readonly EmailMessage Minimal = new() { From = "a@x.dev", To = "b@x.dev", Subject = "s" };

    /// <summary>Structural equality: no missing, extra or misnamed keys.</summary>
    private static void AssertJson(string expected, string? actual)
        => Assert.True(
            JsonNode.DeepEquals(JsonNode.Parse(expected), JsonNode.Parse(actual ?? "null")),
            $"expected: {expected}\nactual:   {actual}");

    // ---- emails: body completeness, options ------------------------------

    [Fact]
    public async Task EmailSend_puts_every_field_on_the_wire()
    {
        var (client, handler) = NewClient();
        await client.EmailSendAsync(new EmailMessage
        {
            From = "Acme <a@x.dev>",
            To = new[] { "b@x.dev", "c@x.dev" },
            Subject = "s",
            Html = "<p>h</p>",
            Text = "t",
            Cc = "cc@x.dev",
            Bcc = new[] { "bcc@x.dev" },
            ReplyTo = "r@x.dev",
            ScheduledAt = "2999-01-01T00:00:00Z",
            Tags = new() { new Tag { Name = "k", Value = "v" } },
            TopicId = T1,
            Attachments = new()
            {
                new EmailAttachment { Filename = "a.txt", Content = "aGk=", ContentType = "text/plain", ContentId = "cid1", Path = "https://x.dev/a.txt" },
            },
            Headers = new() { ["X-Entity-Ref-ID"] = "123" },
            Template = new EmailMessageTemplate { TemplateId = "tpl_1", Variables = new() { ["name"] = "Ada", ["n"] = 2 } },
        });

        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/emails", handler.Last.Path);
        AssertJson($$"""
            {
              "from": "Acme <a@x.dev>",
              "to": ["b@x.dev", "c@x.dev"],
              "subject": "s",
              "html": "<p>h</p>",
              "text": "t",
              "cc": "cc@x.dev",
              "bcc": ["bcc@x.dev"],
              "reply_to": "r@x.dev",
              "scheduled_at": "2999-01-01T00:00:00Z",
              "tags": [{ "name": "k", "value": "v" }],
              "topic_id": "{{T1}}",
              "attachments": [{ "filename": "a.txt", "content": "aGk=", "content_type": "text/plain", "content_id": "cid1", "path": "https://x.dev/a.txt" }],
              "headers": { "X-Entity-Ref-ID": "123" },
              "template": { "id": "tpl_1", "variables": { "name": "Ada", "n": 2 } }
            }
            """, handler.Last.Body);
    }

    [Fact]
    public async Task EmailSend_resend_style_idempotency_overload()
    {
        var (client, handler) = NewClient();
        await client.EmailSendAsync("key-2", Minimal);
        Assert.Equal("key-2", handler.Last.IdempotencyKey);
        Assert.Equal("a@x.dev", handler.LastJson().GetProperty("from").GetString());
    }

    [Fact]
    public async Task EmailBatch_permissive_sends_header_and_types_errors()
    {
        var (client, handler) = NewClient(h => h.ResponseBody =
            "{\"data\":[{\"id\":\"11111111-1111-1111-1111-111111111111\"}],\"errors\":[{\"index\":1,\"message\":\"to is required\"}]}");

        var res = await client.EmailBatchAsync(new[] { Minimal, Minimal }, BatchValidationMode.Permissive, idempotencyKey: "b-2");

        Assert.Equal("/emails/batch", handler.Last.Path);
        Assert.Equal("permissive", handler.Last.BatchValidation);
        Assert.Equal("b-2", handler.Last.IdempotencyKey);
        Assert.Equal(2, handler.LastJson().GetArrayLength());
        Assert.True(res.Success);
        Assert.Single(res.Content!.Data);
        var err = Assert.Single(res.Content.Errors!);
        Assert.Equal(1, err.Index);
        Assert.Equal("to is required", err.Message);
    }

    [Fact]
    public async Task EmailBatch_strict_header_and_resend_style_overloads()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = "{\"data\":[]}");

        var plain = await client.EmailBatchAsync(new[] { Minimal });
        Assert.Null(handler.Last.BatchValidation);
        Assert.Null(plain.Content!.Errors);

        await client.EmailBatchAsync("k1", new[] { Minimal });
        Assert.Equal("k1", handler.Last.IdempotencyKey);
        Assert.Null(handler.Last.BatchValidation);

        await client.EmailBatchAsync("k2", new[] { Minimal }, BatchValidationMode.Strict);
        Assert.Equal("k2", handler.Last.IdempotencyKey);
        Assert.Equal("strict", handler.Last.BatchValidation);
    }

    [Fact]
    public async Task Emails_list_reschedule_delete()
    {
        var (client, handler) = NewClient();

        await client.EmailListAsync(new ListOptions { Limit = 5, After = E1 });
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal("/emails", handler.Last.Path);
        Assert.Equal($"?limit=5&after={E1}", handler.Last.Query);

        await client.EmailRescheduleAsync(E1, "2999-01-01T00:00:00Z");
        Assert.Equal("PATCH", handler.Last.Method);
        Assert.Equal($"/emails/{E1}", handler.Last.Path);
        AssertJson("""{ "scheduled_at": "2999-01-01T00:00:00Z" }""", handler.Last.Body);

        await client.EmailDeleteAsync(E1);
        Assert.Equal("DELETE", handler.Last.Method);
        Assert.Equal($"/emails/{E1}", handler.Last.Path);
    }

    // ---- contacts: full bodies, null-clear, batch, segments --------------

    [Fact]
    public async Task Contacts_create_puts_every_field_on_the_wire()
    {
        var (client, handler) = NewClient();
        await client.ContactAddAsync(new ContactCreateOptions
        {
            Email = "c@x.dev",
            FirstName = "Ada",
            LastName = "Lovelace",
            Unsubscribed = false,
            Properties = new() { ["plan"] = "pro", ["seats"] = 3 },
            Segments = new() { new SegmentRef { Id = S1 } },
            Topics = new() { new ContactTopicUpdate { Id = T1, Subscription = TopicSubscription.OptIn } },
        });

        AssertJson($$"""
            {
              "email": "c@x.dev",
              "first_name": "Ada",
              "last_name": "Lovelace",
              "unsubscribed": false,
              "properties": { "plan": "pro", "seats": 3 },
              "segments": [{ "id": "{{S1}}" }],
              "topics": [{ "id": "{{T1}}", "subscription": "opt_in" }]
            }
            """, handler.Last.Body);
    }

    [Fact]
    public async Task Contacts_update_clears_with_explicit_null()
    {
        var (client, handler) = NewClient();
        await client.ContactUpdateAsync(new ContactUpdateOptions
        {
            Id = C1,
            FirstName = Optional<string>.Null,
            LastName = "Lovelace",
            Properties = new() { ["plan"] = null },
        });

        Assert.Equal("PATCH", handler.Last.Method);
        AssertJson("""{ "first_name": null, "last_name": "Lovelace", "properties": { "plan": null } }""", handler.Last.Body);
    }

    [Fact]
    public async Task Contacts_update_plain_null_still_omits()
    {
        var (client, handler) = NewClient();
        string? unset = null;
        await client.ContactUpdateAsync(new ContactUpdateOptions { Id = C1, FirstName = unset, Unsubscribed = true });
        AssertJson("""{ "unsubscribed": true }""", handler.Last.Body);
    }

    [Fact]
    public async Task Contacts_batch_sends_query_header_and_types_response()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            {
              "data": [{ "object": "contact", "index": 0, "id": "{{C1}}", "status": "created" }],
              "counts": { "created": 1, "updated": 0, "skipped": 0, "failed": 1 },
              "errors": [{ "index": 1, "message": "email: invalid" }]
            }
            """);

        var res = await client.ContactBatchAsync(
            new[] { new ContactCreateOptions { Email = "a@x.dev" }, new ContactCreateOptions { Email = "bad" } },
            new ContactBatchOptions { OnConflict = ContactBatchOnConflict.Upsert, Validation = BatchValidationMode.Permissive });

        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/contacts/batch", handler.Last.Path);
        Assert.Equal("?on_conflict=upsert", handler.Last.Query);
        Assert.Equal("permissive", handler.Last.BatchValidation);
        AssertJson("""[{ "email": "a@x.dev" }, { "email": "bad" }]""", handler.Last.Body);

        Assert.True(res.Success);
        var item = Assert.Single(res.Content!.Data);
        Assert.Equal(0, item.Index);
        Assert.Equal(C1, item.Id);
        Assert.Equal("created", item.Status);
        Assert.Equal(1, res.Content.Counts.Failed);
        Assert.Equal(1, Assert.Single(res.Content.Errors!).Index);

        await client.ContactBatchAsync(new[] { new ContactCreateOptions { Email = "a@x.dev" } });
        Assert.Equal(string.Empty, handler.Last.Query);
        Assert.Null(handler.Last.BatchValidation);
    }

    [Fact]
    public async Task Contacts_segment_add_and_remove()
    {
        var (client, handler) = NewClient();

        await client.ContactAddToSegmentAsync(new ContactAddress { Id = C1 }, S1);
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal($"/contacts/{C1}/segments/{S1}", handler.Last.Path);

        await client.ContactRemoveFromSegmentAsync(new ContactAddress { Email = "c@x.dev" }, S1);
        Assert.Equal("DELETE", handler.Last.Method);
        Assert.Equal("/contacts/" + Uri.EscapeDataString("c@x.dev") + $"/segments/{S1}", handler.Last.Path);
    }

    [Fact]
    public async Task Contacts_batch_remove_by_emails_or_ids()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            { "data": [{ "object": "contact", "contact": "{{C1}}", "deleted": true }] }
            """);

        var byEmail = await client.ContactBatchRemoveAsync(new[] { "a@x.dev", "b@x.dev" });
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/contacts/batch/remove", handler.Last.Path);
        AssertJson("""{ "emails": ["a@x.dev", "b@x.dev"] }""", handler.Last.Body);
        Assert.True(byEmail.Success);
        var row = Assert.Single(byEmail.Content!.Data);
        Assert.Equal("contact", row.Object);
        Assert.Equal(C1.ToString(), row.Contact);
        Assert.True(row.Deleted);

        await client.ContactBatchRemoveAsync(new[] { C1, S1 });
        Assert.Equal("/contacts/batch/remove", handler.Last.Path);
        AssertJson($$"""{ "ids": ["{{C1}}", "{{S1}}"] }""", handler.Last.Body);

        await client.ContactBatchRemoveAsync(new[] { C1 }, new ContactDeleteOptions { Erase = true });
        AssertJson($$"""{ "ids": ["{{C1}}"], "erase": true }""", handler.Last.Body);
        await client.ContactBatchRemoveAsync(new[] { "a@x.dev" }, new ContactDeleteOptions { Erase = true });
        AssertJson("""{ "emails": ["a@x.dev"], "erase": true }""", handler.Last.Body);
    }

    [Fact]
    public async Task Contacts_list_include_joins_facets_and_types_them()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            { "object": "list", "has_more": false,
              "data": [{
                "id": "{{C1}}", "email": "a@x.dev", "first_name": "Ada", "last_name": null, "created_at": "2026-01-01T00:00:00Z", "unsubscribed": false,
                "properties": { "plan": { "type": "string", "value": "pro" } },
                "topics": [{ "id": "{{T1}}", "name": "Deals", "description": null, "subscription": "opt_out", "explicit": true, "visibility": "public" }]
              }] }
            """);

        var res = await client.ContactListAsync(new ContactListOptions { Limit = 100, Include = new() { ContactInclude.Properties, ContactInclude.Topics } });
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal("/contacts", handler.Last.Path);
        Assert.Equal("?limit=100&include=properties%2Ctopics", handler.Last.Query);

        var row = Assert.Single(res.Content!.Data);
        Assert.Equal("pro", ((JsonElement)row.Properties!["plan"]!).GetProperty("value").GetString());
        var topic = Assert.Single(row.Topics!);
        Assert.Equal(T1, topic.Id);
        Assert.Equal(TopicSubscription.OptOut, topic.Subscription);
        Assert.Equal(TopicVisibility.Public, topic.Visibility);

        await client.SegmentContactListAsync(S1, new ContactListOptions { Include = new() { ContactInclude.Topics } });
        Assert.Equal($"/segments/{S1}/contacts", handler.Last.Path);
        Assert.Equal("?include=topics", handler.Last.Query);

        await client.ContactListAsync(new ContactListOptions { Limit = 5, Include = new() });
        Assert.Equal("?limit=5", handler.Last.Query);
    }

    [Fact]
    public async Task Contacts_batch_get_posts_ids_and_emails_and_lists_missing()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            { "object": "list",
              "data": [{ "object": "contact", "id": "{{C1}}", "email": "a@x.dev", "first_name": null, "last_name": null, "created_at": "2026-01-01T00:00:00Z", "unsubscribed": false, "topics": [] }],
              "missing": [{ "index": 1, "email": "b@x.dev" }, { "index": 2, "id": "{{S1}}" }] }
            """);

        var res = await client.ContactBatchGetAsync(
            new[] { new ContactAddress { Id = C1 }, new ContactAddress { Email = "b@x.dev" }, new ContactAddress { Id = S1, Email = "" } },
            new ContactBatchGetOptions { Include = new() { ContactInclude.Properties, ContactInclude.Topics } });

        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/contacts/batch/get", handler.Last.Path);
        Assert.Equal(string.Empty, handler.Last.Query);
        AssertJson($$"""{ "contacts": [{ "id": "{{C1}}" }, { "email": "b@x.dev" }, { "id": "{{S1}}" }], "include": ["properties", "topics"] }""", handler.Last.Body);

        Assert.True(res.Success);
        Assert.Equal("list", res.Content!.Object);
        var found = Assert.Single(res.Content.Data);
        Assert.Equal("contact", found.Object);
        Assert.Equal(C1, found.Id);
        Assert.Empty(found.Topics!);
        Assert.Null(found.Properties);
        Assert.Equal(2, res.Content.Missing.Count);
        Assert.Equal(1, res.Content.Missing[0].Index);
        Assert.Equal("b@x.dev", res.Content.Missing[0].Email);
        Assert.Null(res.Content.Missing[0].Id);
        Assert.Equal(S1, res.Content.Missing[1].Id);

        // Email wins over id, as everywhere a ContactAddress is accepted; no include -> key omitted.
        await client.ContactBatchGetAsync(new[] { new ContactAddress { Id = C1, Email = "a@x.dev" } });
        AssertJson("""{ "contacts": [{ "email": "a@x.dev" }] }""", handler.Last.Body);
    }

    [Fact]
    public async Task Contacts_preferences_link_by_email_or_id()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            { "object": "preferences_link", "contact": "{{C1}}", "url": "https://app.test/u/tok" }
            """);

        var res = await client.ContactPreferencesLinkAsync(new ContactAddress { Email = "c@x.dev" });
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/contacts/c%40x.dev/preferences-link", handler.Last.Path);
        Assert.Null(handler.Last.Body);
        Assert.True(res.Success);
        Assert.Equal("preferences_link", res.Content!.Object);
        Assert.Equal(C1, res.Content.Contact);
        Assert.Equal("https://app.test/u/tok", res.Content.Url);

        await client.ContactPreferencesLinkAsync(new ContactAddress { Id = C1 });
        Assert.Equal($"/contacts/{C1}/preferences-link", handler.Last.Path);
    }

    [Fact]
    public async Task Contacts_preferences_link_422_when_instance_cannot_mint()
    {
        var (client, _) = NewClient(h =>
        {
            h.Status = System.Net.HttpStatusCode.UnprocessableEntity;
            h.ResponseBody = "{\"statusCode\":422,\"name\":\"validation_error\",\"message\":\"APP_BASE_URL and MASTER_ENCRYPTION_KEY must be set to mint preference links\"}";
        });
        var res = await client.ContactPreferencesLinkAsync(new ContactAddress { Id = C1 });
        Assert.False(res.Success);
        Assert.Equal(422, res.Exception!.StatusCode);
        Assert.Equal("validation_error", res.Exception.ErrorName);
    }

    // ---- contact properties ---------------------------------------------

    [Fact]
    public async Task ContactProps_crud()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            { "object": "contact_property", "id": "{{P1}}", "key": "plan", "type": "string",
              "fallback_value": "free", "created_at": "2026-01-01T00:00:00Z" }
            """);

        var created = await client.ContactPropCreateAsync(new ContactPropertyCreateOptions
        {
            Key = "plan", Type = ContactPropertyType.String, FallbackValue = "free",
        });
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/contact-properties", handler.Last.Path);
        AssertJson("""{ "key": "plan", "type": "string", "fallback_value": "free" }""", handler.Last.Body);
        Assert.Equal(ContactPropertyType.String, created.Content!.Type);
        Assert.Equal("free", ((JsonElement)created.Content.FallbackValue!).GetString());

        await client.ContactPropListAsync(new ListOptions { Limit = 10 });
        Assert.Equal("/contact-properties", handler.Last.Path);
        Assert.Equal("?limit=10", handler.Last.Query);

        await client.ContactPropRetrieveAsync(P1);
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal($"/contact-properties/{P1}", handler.Last.Path);

        await client.ContactPropUpdateAsync(P1, new ContactPropertyUpdateOptions { FallbackValue = 5 });
        Assert.Equal("PATCH", handler.Last.Method);
        AssertJson("""{ "fallback_value": 5 }""", handler.Last.Body);

        await client.ContactPropUpdateAsync(P1, new ContactPropertyUpdateOptions { FallbackValue = Optional<object>.Null });
        AssertJson("""{ "fallback_value": null }""", handler.Last.Body);

        await client.ContactPropDeleteAsync(P1);
        Assert.Equal("DELETE", handler.Last.Method);
        Assert.Equal($"/contact-properties/{P1}", handler.Last.Path);
    }

    // ---- topics / segments extras ---------------------------------------

    [Fact]
    public async Task Topics_update_and_segment_contacts()
    {
        var (client, handler) = NewClient();

        await client.TopicUpdateAsync(T1, new TopicUpdateOptions { Name = "Renamed", Visibility = TopicVisibility.Public });
        Assert.Equal("PATCH", handler.Last.Method);
        Assert.Equal($"/topics/{T1}", handler.Last.Path);
        AssertJson("""{ "name": "Renamed", "visibility": "public" }""", handler.Last.Body);

        await client.SegmentContactListAsync(S1, new ListOptions { Limit = 7 });
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal($"/segments/{S1}/contacts", handler.Last.Path);
        Assert.Equal("?limit=7", handler.Last.Query);
    }

    // ---- broadcasts: full body, null-clear ------------------------------

    [Fact]
    public async Task Broadcasts_create_puts_every_field_on_the_wire()
    {
        var (client, handler) = NewClient();
        await client.BroadcastAddAsync(new BroadcastCreateOptions
        {
            Name = "n",
            SegmentId = S1,
            From = "a@x.dev",
            Subject = "News",
            Html = "<p>hi</p>",
            Text = "hi",
            ReplyTo = "r@x.dev",
            PreviewText = "pre",
            TopicId = T1,
            Send = true,
            ScheduledAt = "2999-01-01T00:00:00Z",
        });

        AssertJson($$"""
            {
              "name": "n", "segment_id": "{{S1}}", "from": "a@x.dev", "subject": "News",
              "html": "<p>hi</p>", "text": "hi", "reply_to": "r@x.dev", "preview_text": "pre",
              "topic_id": "{{T1}}", "send": true, "scheduled_at": "2999-01-01T00:00:00Z"
            }
            """, handler.Last.Body);
    }

    [Fact]
    public async Task Broadcasts_update_clears_topic_with_explicit_null()
    {
        var (client, handler) = NewClient();

        await client.BroadcastUpdateAsync(B1, new BroadcastUpdateOptions { TopicId = Optional<Guid?>.Null, PreviewText = "p" });
        AssertJson("""{ "preview_text": "p", "topic_id": null }""", handler.Last.Body);

        await client.BroadcastUpdateAsync(B1, new BroadcastUpdateOptions { TopicId = T1 });
        AssertJson($$"""{ "topic_id": "{{T1}}" }""", handler.Last.Body);

        Guid? unset = null;
        await client.BroadcastUpdateAsync(B1, new BroadcastUpdateOptions { TopicId = unset, Subject = "s" });
        AssertJson("""{ "subject": "s" }""", handler.Last.Body);
    }

    // ---- suppressions ----------------------------------------------------

    [Fact]
    public async Task Suppressions_crud()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            { "object": "suppression", "id": "{{X1}}", "email": "s@x.dev", "origin": "manual",
              "source_id": null, "created_at": "2026-01-01T00:00:00Z" }
            """);

        await client.SuppressionAddAsync("s@x.dev", SuppressionOrigin.Manual);
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/suppressions", handler.Last.Path);
        AssertJson("""{ "email": "s@x.dev", "origin": "manual" }""", handler.Last.Body);

        await client.SuppressionAddAsync("s@x.dev");
        AssertJson("""{ "email": "s@x.dev" }""", handler.Last.Body);

        await client.SuppressionListAsync(new SuppressionListOptions { Limit = 10, Origin = SuppressionOrigin.Bounce });
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal("/suppressions", handler.Last.Path);
        Assert.Equal("?limit=10&origin=bounce", handler.Last.Query);

        await client.SuppressionListAsync(new ListOptions { Limit = 3 });
        Assert.Equal("?limit=3", handler.Last.Query);

        var got = await client.SuppressionRetrieveAsync("s@x.dev");
        Assert.Equal("/suppressions/" + Uri.EscapeDataString("s@x.dev"), handler.Last.Path);
        Assert.Equal(SuppressionOrigin.Manual, got.Content!.Origin);
        Assert.Null(got.Content.SourceId);

        await client.SuppressionRemoveAsync(X1.ToString());
        Assert.Equal("DELETE", handler.Last.Method);
        Assert.Equal($"/suppressions/{X1}", handler.Last.Path);
    }

    [Fact]
    public async Task Suppressions_batch_add_and_remove()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            { "data": [{ "object": "suppression", "id": "{{X1}}", "deleted": true }] }
            """);

        await client.SuppressionBatchAddAsync(new[] { "a@x.dev", "b@x.dev" }, SuppressionOrigin.Unsubscribe);
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/suppressions/batch/add", handler.Last.Path);
        AssertJson("""{ "emails": ["a@x.dev", "b@x.dev"], "origin": "unsubscribe" }""", handler.Last.Body);

        var byEmail = await client.SuppressionBatchRemoveAsync(new[] { "a@x.dev" });
        Assert.Equal("/suppressions/batch/remove", handler.Last.Path);
        AssertJson("""{ "emails": ["a@x.dev"] }""", handler.Last.Body);
        Assert.True(Assert.Single(byEmail.Content!.Data).Deleted);

        await client.SuppressionBatchRemoveAsync(new[] { X1 });
        AssertJson($$"""{ "ids": ["{{X1}}"] }""", handler.Last.Body);
    }

    // ---- domains ---------------------------------------------------------

    [Fact]
    public async Task Domains_crud()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            {
              "object": "domain", "id": "{{D1}}", "name": "acme.dev", "status": "pending",
              "created_at": "2026-01-01T00:00:00Z", "region": "us-east-1",
              "open_tracking": false, "click_tracking": true, "tracking_subdomain": null,
              "capabilities": { "sending": "enabled", "receiving": "disabled" },
              "records": [{ "record": "SPF", "name": "send", "type": "MX", "ttl": "Auto",
                            "status": "not_started", "value": "feedback-smtp.us-east-1.amazonses.com", "priority": 10 }]
            }
            """);

        var created = await client.DomainAddAsync(new DomainCreateOptions
        {
            Name = "acme.dev", Region = "us-east-1", CustomReturnPath = "mail",
            OpenTracking = false, ClickTracking = true, TrackingSubdomain = "track",
        });
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/domains", handler.Last.Path);
        AssertJson("""
            { "name": "acme.dev", "region": "us-east-1", "custom_return_path": "mail",
              "open_tracking": false, "click_tracking": true, "tracking_subdomain": "track" }
            """, handler.Last.Body);
        Assert.Equal("enabled", created.Content!.Capabilities!.Sending);
        Assert.Equal(10, Assert.Single(created.Content.Records!).Priority);
        Assert.Null(created.Content.TrackingSubdomain);

        await client.DomainListAsync(new ListOptions { Limit = 2 });
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal("/domains", handler.Last.Path);
        Assert.Equal("?limit=2", handler.Last.Query);

        await client.DomainRetrieveAsync(D1);
        Assert.Equal($"/domains/{D1}", handler.Last.Path);

        await client.DomainVerifyAsync(D1);
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal($"/domains/{D1}/verify", handler.Last.Path);
        Assert.Null(handler.Last.Body);

        await client.DomainUpdateAsync(D1, new DomainUpdateOptions { OpenTracking = true, TrackingSubdomain = Optional<string>.Null });
        Assert.Equal("PATCH", handler.Last.Method);
        Assert.Equal($"/domains/{D1}", handler.Last.Path);
        AssertJson("""{ "open_tracking": true, "tracking_subdomain": null }""", handler.Last.Body);

        await client.DomainUpdateAsync(D1, new DomainUpdateOptions { ClickTracking = false });
        AssertJson("""{ "click_tracking": false }""", handler.Last.Body);

        await client.DomainDeleteAsync(D1);
        Assert.Equal("DELETE", handler.Last.Method);
        Assert.Equal($"/domains/{D1}", handler.Last.Path);
    }

    // ---- webhooks --------------------------------------------------------

    [Fact]
    public async Task Webhooks_crud()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            { "object": "webhook", "id": "{{W1}}", "endpoint": "https://x.dev/hook",
              "created_at": "2026-01-01T00:00:00Z", "status": "enabled",
              "events": ["email.delivered"], "signing_secret": "whsec_1",
              "previous_secret_expires_at": "2026-01-02T00:00:00Z" }
            """);

        var created = await client.WebhookCreateAsync(new WebhookCreateOptions
        {
            Endpoint = "https://x.dev/hook",
            Events = new() { "email.delivered", "email.bounced" },
            SigningSecret = "whsec_1",
        });
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/webhooks", handler.Last.Path);
        AssertJson("""{ "endpoint": "https://x.dev/hook", "events": ["email.delivered", "email.bounced"], "signing_secret": "whsec_1" }""", handler.Last.Body);
        Assert.Equal("whsec_1", created.Content!.SigningSecret);

        await client.WebhookListAsync();
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal("/webhooks", handler.Last.Path);

        var got = await client.WebhookRetrieveAsync(W1);
        Assert.Equal($"/webhooks/{W1}", handler.Last.Path);
        Assert.Equal(WebhookStatus.Enabled, got.Content!.Status);
        Assert.Equal("whsec_1", got.Content.SigningSecret);
        Assert.Equal("2026-01-02T00:00:00Z", got.Content.PreviousSecretExpiresAt);

        await client.WebhookUpdateAsync(W1, new WebhookUpdateOptions
        {
            Endpoint = "https://x.dev/hook2", Events = new() { "email.opened" }, Status = WebhookStatus.Disabled,
        });
        Assert.Equal("PATCH", handler.Last.Method);
        Assert.Equal($"/webhooks/{W1}", handler.Last.Path);
        AssertJson("""{ "endpoint": "https://x.dev/hook2", "events": ["email.opened"], "status": "disabled" }""", handler.Last.Body);

        await client.WebhookDeleteAsync(W1);
        Assert.Equal("DELETE", handler.Last.Method);
        Assert.Equal($"/webhooks/{W1}", handler.Last.Path);
    }

    [Fact]
    public async Task Webhooks_rotate_sends_empty_body_or_options()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            { "object": "webhook", "id": "{{W1}}", "signing_secret": "whsec_2",
              "previous_secret_expires_at": "2026-01-02T00:00:00Z" }
            """);

        var res = await client.WebhookRotateAsync(W1);
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal($"/webhooks/{W1}/rotate", handler.Last.Path);
        AssertJson("{}", handler.Last.Body);
        Assert.True(res.Success);
        Assert.Equal(W1, res.Content!.Id);
        Assert.Equal("whsec_2", res.Content.SigningSecret);
        Assert.Equal("2026-01-02T00:00:00Z", res.Content.PreviousSecretExpiresAt);

        await client.WebhookRotateAsync(W1, new WebhookRotateOptions { SigningSecret = "whsec_mine", OverlapHours = 0 });
        AssertJson("""{ "signing_secret": "whsec_mine", "overlap_hours": 0 }""", handler.Last.Body);

        await client.WebhookRotateAsync(W1, new WebhookRotateOptions { OverlapHours = 72 });
        AssertJson("""{ "overlap_hours": 72 }""", handler.Last.Body);

        handler.ResponseBody = $$"""{ "object": "webhook", "id": "{{W1}}", "signing_secret": "whsec_3", "previous_secret_expires_at": null }""";
        var dropped = await client.WebhookRotateAsync(W1, new WebhookRotateOptions { OverlapHours = 0 });
        Assert.Null(dropped.Content!.PreviousSecretExpiresAt);
    }

    // ---- api keys --------------------------------------------------------

    [Fact]
    public async Task ApiKeys_create_list_delete()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""{ "id": "{{K1}}", "token": "ms_secret" }""");

        var created = await client.ApiKeyCreateAsync("ci", ApiKeyPermission.SendingAccess, D1);
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/api-keys", handler.Last.Path);
        AssertJson($$"""{ "name": "ci", "permission": "sending_access", "domain_id": "{{D1}}" }""", handler.Last.Body);
        Assert.Equal("ms_secret", created.Content!.Token);

        await client.ApiKeyCreateAsync("ci");
        AssertJson("""{ "name": "ci" }""", handler.Last.Body);

        await client.ApiKeyListAsync();
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal("/api-keys", handler.Last.Path);

        await client.ApiKeyDeleteAsync(K1);
        Assert.Equal("DELETE", handler.Last.Method);
        Assert.Equal($"/api-keys/{K1}", handler.Last.Path);
    }

    // ---- templates -------------------------------------------------------

    [Fact]
    public async Task Templates_crud_by_id_or_alias()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""{ "object": "template", "id": "{{TP1}}" }""");

        await client.TemplateCreateAsync(new TemplateCreateOptions
        {
            Name = "Welcome", Html = "<p>hi</p>", Subject = "Hi", Text = "hi", Alias = "welcome",
        });
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/templates", handler.Last.Path);
        AssertJson("""{ "name": "Welcome", "html": "<p>hi</p>", "subject": "Hi", "text": "hi", "alias": "welcome" }""", handler.Last.Body);

        await client.TemplateListAsync(new ListOptions { Before = TP1 });
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal("/templates", handler.Last.Path);
        Assert.Equal($"?before={TP1}", handler.Last.Query);

        await client.TemplateRetrieveAsync("welcome");
        Assert.Equal("/templates/welcome", handler.Last.Path);

        await client.TemplateUpdateAsync(TP1.ToString(), new TemplateUpdateOptions
        {
            Name = "W2", Subject = Optional<string>.Null, Text = Optional<string>.Null, Alias = Optional<string>.Null,
        });
        Assert.Equal("PATCH", handler.Last.Method);
        Assert.Equal($"/templates/{TP1}", handler.Last.Path);
        AssertJson("""{ "name": "W2", "subject": null, "text": null, "alias": null }""", handler.Last.Body);

        await client.TemplateUpdateAsync("welcome", new TemplateUpdateOptions { Html = "<b>x</b>", Alias = "w2" });
        AssertJson("""{ "html": "<b>x</b>", "alias": "w2" }""", handler.Last.Body);

        await client.TemplatePublishAsync("welcome");
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/templates/welcome/publish", handler.Last.Path);

        await client.TemplateDuplicateAsync(TP1.ToString());
        Assert.Equal($"/templates/{TP1}/duplicate", handler.Last.Path);

        await client.TemplateDeleteAsync("welcome");
        Assert.Equal("DELETE", handler.Last.Method);
        Assert.Equal("/templates/welcome", handler.Last.Path);
    }

    // ---- usage -----------------------------------------------------------

    [Fact]
    public async Task Usage_maps_path_and_deserializes()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            {
              "object": "usage", "cloud": true, "plan": "pro",
              "limits": { "emails_per_day": 50000, "domains": null },
              "today": { "emails_sent": 1200, "resets_at": "2026-09-05T00:00:00Z" },
              "team": { "id": "{{C1}}", "name": "Acme" },
              "app_url": "https://app.millionsend.com"
            }
            """);

        var res = await client.UsageRetrieveAsync();
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal("/usage", handler.Last.Path);
        Assert.True(res.Success);

        var u = res.Content!;
        Assert.True(u.Cloud);
        Assert.Equal("pro", u.Plan);
        Assert.Equal(50000, u.Limits.EmailsPerDay);
        Assert.Null(u.Limits.Domains);
        Assert.Equal(1200, u.Today.EmailsSent);
        Assert.Equal(C1, u.Team.Id);
        Assert.Equal("Acme", u.Team.Name);
        Assert.Equal("https://app.millionsend.com", u.AppUrl);
    }
}
