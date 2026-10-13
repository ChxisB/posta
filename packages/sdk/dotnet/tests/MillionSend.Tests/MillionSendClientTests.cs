using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Xunit;

namespace MillionSend.Tests;

public partial class MillionSendClientTests
{
    private static readonly Guid C1 = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid B1 = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid S1 = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid T1 = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static readonly Guid E1 = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");

    private static (MillionSendClient client, RecordingHandler handler) NewClient(Action<RecordingHandler>? setup = null)
    {
        var handler = new RecordingHandler();
        setup?.Invoke(handler);
        var client = new MillionSendClient(
            new MillionSendClientOptions { ApiToken = "ms_test", ApiUrl = "https://api.test" },
            new HttpClient(handler));
        return (client, handler);
    }

    // ---- construction ----------------------------------------------------

    [Fact]
    public void MissingApiKey_throws()
    {
        var prior = Environment.GetEnvironmentVariable("MILLIONSEND_API_KEY");
        Environment.SetEnvironmentVariable("MILLIONSEND_API_KEY", null);
        try
        {
            Assert.Throws<ArgumentException>(() => new MillionSendClient(new MillionSendClientOptions()));
        }
        finally
        {
            Environment.SetEnvironmentVariable("MILLIONSEND_API_KEY", prior);
        }
    }

    [Fact]
    public async Task EnvVars_supply_key_and_base_url()
    {
        var priorKey = Environment.GetEnvironmentVariable("MILLIONSEND_API_KEY");
        var priorUrl = Environment.GetEnvironmentVariable("MILLIONSEND_BASE_URL");
        Environment.SetEnvironmentVariable("MILLIONSEND_API_KEY", "ms_env");
        Environment.SetEnvironmentVariable("MILLIONSEND_BASE_URL", "https://env.test/");
        try
        {
            var handler = new RecordingHandler();
            var client = new MillionSendClient(new MillionSendClientOptions(), new HttpClient(handler));
            await client.TopicRetrieveAsync(T1);

            Assert.Equal("Bearer ms_env", handler.Last.Authorization);
            // Trailing slash on the base URL is trimmed.
            Assert.Equal($"https://env.test/topics/{T1}", handler.Last.Url);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MILLIONSEND_API_KEY", priorKey);
            Environment.SetEnvironmentVariable("MILLIONSEND_BASE_URL", priorUrl);
        }
    }

    [Fact]
    public async Task Default_base_url_is_millionsend_cloud()
    {
        var priorUrl = Environment.GetEnvironmentVariable("MILLIONSEND_BASE_URL");
        Environment.SetEnvironmentVariable("MILLIONSEND_BASE_URL", null);
        try
        {
            var handler = new RecordingHandler();
            var client = new MillionSendClient(new MillionSendClientOptions { ApiToken = "ms_test" }, new HttpClient(handler));
            await client.TopicRetrieveAsync(T1);
            Assert.Equal($"https://api.millionsend.com/topics/{T1}", handler.Last.Url);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MILLIONSEND_BASE_URL", priorUrl);
        }
    }

    [Fact]
    public async Task Explicit_base_url_wins_over_env_var()
    {
        var priorUrl = Environment.GetEnvironmentVariable("MILLIONSEND_BASE_URL");
        Environment.SetEnvironmentVariable("MILLIONSEND_BASE_URL", "https://env.test");
        try
        {
            var handler = new RecordingHandler();
            var client = new MillionSendClient(
                new MillionSendClientOptions { ApiToken = "ms_test", ApiUrl = "https://explicit.test" },
                new HttpClient(handler));
            await client.TopicRetrieveAsync(T1);
            Assert.Equal($"https://explicit.test/topics/{T1}", handler.Last.Url);
        }
        finally
        {
            Environment.SetEnvironmentVariable("MILLIONSEND_BASE_URL", priorUrl);
        }
    }

    [Fact]
    public void Refuses_non_loopback_http_unless_allowed()
    {
        var priorUrl = Environment.GetEnvironmentVariable("MILLIONSEND_BASE_URL");
        Environment.SetEnvironmentVariable("MILLIONSEND_BASE_URL", "http://mail.example.com");
        try
        {
            Assert.Throws<ArgumentException>(() => new MillionSendClient("ms_test"));
        }
        finally
        {
            Environment.SetEnvironmentVariable("MILLIONSEND_BASE_URL", priorUrl);
        }
        Assert.Throws<ArgumentException>(() => new MillionSendClient("ms_test", "http://mail.example.com"));
        _ = new MillionSendClient(new MillionSendClientOptions
        {
            ApiToken = "ms_test", ApiUrl = "http://mail.example.com", AllowInsecureHttp = true,
        });
        _ = new MillionSendClient("ms_test", "http://localhost:3001");
        _ = new MillionSendClient("ms_test", "http://127.0.0.1:3001");
    }

    [Fact]
    public async Task Sends_auth_and_user_agent_headers()
    {
        var (client, handler) = NewClient();
        await client.TopicRetrieveAsync(T1);
        Assert.Equal("Bearer ms_test", handler.Last.Authorization);
        Assert.StartsWith("millionsend-dotnet/", handler.Last.UserAgent);
    }

    // ---- emails ----------------------------------------------------------

    [Fact]
    public async Task EmailSend_maps_path_and_body()
    {
        var (client, handler) = NewClient();
        await client.EmailSendAsync(new EmailMessage
        {
            From = "a@x.dev",
            To = new[] { "b@x.dev" },
            Subject = "s",
            Html = "<p>h</p>",
            ReplyTo = "r@x.dev",
            ScheduledAt = "2999-01-01T00:00:00Z",
        });

        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/emails", handler.Last.Path);

        var body = handler.LastJson();
        Assert.Equal("a@x.dev", body.GetProperty("from").GetString());
        Assert.Equal("b@x.dev", body.GetProperty("to")[0].GetString());
        Assert.Equal("s", body.GetProperty("subject").GetString());
        Assert.Equal("<p>h</p>", body.GetProperty("html").GetString());
        Assert.Equal("r@x.dev", body.GetProperty("reply_to").GetString());
        Assert.Equal("2999-01-01T00:00:00Z", body.GetProperty("scheduled_at").GetString());
        // Unset optionals are omitted, not sent as null.
        Assert.False(body.TryGetProperty("text", out _));
        Assert.False(body.TryGetProperty("cc", out _));
    }

    [Fact]
    public async Task EmailSend_single_recipient_serializes_as_string()
    {
        var (client, handler) = NewClient();
        await client.EmailSendAsync(new EmailMessage { From = "a@x.dev", To = "b@x.dev", Subject = "s" });
        Assert.Equal(JsonValueKind.String, handler.LastJson().GetProperty("to").ValueKind);
    }

    [Fact]
    public async Task EmailSend_idempotency_header()
    {
        var (client, handler) = NewClient();
        await client.EmailSendAsync(new EmailMessage { From = "a@x.dev", To = "b@x.dev", Subject = "s" }, idempotencyKey: "key-1");
        Assert.Equal("key-1", handler.Last.IdempotencyKey);
    }

    [Fact]
    public async Task EmailSend_rejects_idempotency_key_with_crlf()
    {
        var (client, handler) = NewClient();
        var res = await client.EmailSendAsync(
            new EmailMessage { From = "a@x.dev", To = "b@x.dev", Subject = "s" },
            idempotencyKey: "abc\r\nX-Injected: 1");
        Assert.False(res.Success);
        Assert.Null(res.Exception!.StatusCode);
        Assert.Equal("application_error", res.Exception.ErrorName);
        Assert.Empty(handler.Calls);
    }

    [Fact]
    public async Task EmailSend_without_idempotency_omits_header()
    {
        var (client, handler) = NewClient();
        await client.EmailSendAsync(new EmailMessage { From = "a@x.dev", To = "b@x.dev", Subject = "s" });
        Assert.Null(handler.Last.IdempotencyKey);
    }

    [Fact]
    public async Task EmailGet_and_Cancel_paths()
    {
        var (client, handler) = NewClient();
        await client.EmailRetrieveAsync(E1);
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal($"/emails/{E1}", handler.Last.Path);

        await client.EmailCancelAsync(E1);
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal($"/emails/{E1}/cancel", handler.Last.Path);
    }

    [Fact]
    public async Task EmailRetrieve_deserializes_score()
    {
        var (client, _) = NewClient(h => h.ResponseBody =
            $"{{\"object\":\"email\",\"id\":\"{E1}\",\"subject\":\"s\",\"score\":8.5}}");
        var res = await client.EmailRetrieveAsync(E1);
        Assert.True(res.Success);
        Assert.Equal(8.5, res.Content!.Score);
    }

    [Fact]
    public async Task EmailRetrieve_score_null_when_no_insights()
    {
        var (client, _) = NewClient(h => h.ResponseBody =
            $"{{\"object\":\"email\",\"id\":\"{E1}\",\"subject\":\"s\",\"score\":null}}");
        var res = await client.EmailRetrieveAsync(E1);
        Assert.True(res.Success);
        Assert.Null(res.Content!.Score);
    }

    [Fact]
    public async Task EmailInsights_maps_path_and_deserializes()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            {
              "object": "email_insights",
              "email_id": "{{E1}}",
              "score": 8.5,
              "score_version": 1,
              "band": "excellent",
              "marketing": true,
              "html_size_bytes": 12345,
              "computed_at": "2026-08-31T12:00:00.000Z",
              "checks": [
                { "id": "list_unsubscribe", "severity": "critical", "status": "fail",
                  "penalty": 1.25, "detail": { "reason": "missing_header", "count": 2 } },
                { "id": "plain_text_part", "severity": "minor", "status": "pass", "penalty": 0 }
              ]
            }
            """);

        var res = await client.EmailInsightsRetrieveAsync(E1);
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal($"/emails/{E1}/insights", handler.Last.Path);
        Assert.True(res.Success);

        var insights = res.Content!;
        Assert.Equal("email_insights", insights.Object);
        Assert.Equal(E1, insights.EmailId);
        Assert.Equal(8.5, insights.Score);
        Assert.Equal(1, insights.ScoreVersion);
        Assert.Equal("excellent", insights.Band);
        Assert.True(insights.Marketing);
        Assert.Equal(12345, insights.HtmlSizeBytes);
        Assert.Equal("2026-08-31T12:00:00.000Z", insights.ComputedAt);

        Assert.Equal(2, insights.Checks.Count);
        var failed = insights.Checks[0];
        Assert.Equal("list_unsubscribe", failed.Id);
        Assert.Equal("critical", failed.Severity);
        Assert.Equal("fail", failed.Status);
        Assert.Equal(1.25, failed.Penalty);
        Assert.Equal("missing_header", ((JsonElement)failed.Detail!["reason"]!).GetString());
        Assert.Equal(2, ((JsonElement)failed.Detail!["count"]!).GetInt32());

        var passed = insights.Checks[1];
        Assert.Equal("pass", passed.Status);
        Assert.Equal(0, passed.Penalty);
        Assert.Null(passed.Detail);
    }

    [Fact]
    public async Task EmailInsights_unknown_future_values_do_not_throw()
    {
        // Band/severity/status are open sets on the wire; a future value must
        // deserialize, never throw.
        var (client, _) = NewClient(h => h.ResponseBody = $$"""
            {
              "object": "email_insights", "email_id": "{{E1}}", "score": 5,
              "score_version": 9, "band": "stellar", "marketing": false,
              "html_size_bytes": null, "computed_at": "2026-08-31T12:00:00.000Z",
              "checks": [ { "id": "brand_new_check", "severity": "catastrophic",
                            "status": "deferred", "penalty": 0.5 } ]
            }
            """);
        var res = await client.EmailInsightsRetrieveAsync(E1);
        Assert.True(res.Success);
        Assert.Equal("stellar", res.Content!.Band);
        Assert.Null(res.Content.HtmlSizeBytes);
        Assert.Equal("catastrophic", res.Content.Checks[0].Severity);
        Assert.Equal("deferred", res.Content.Checks[0].Status);
    }

    [Fact]
    public async Task EmailInsights_not_found_is_error_response()
    {
        var (client, _) = NewClient(h =>
        {
            h.Status = HttpStatusCode.NotFound;
            h.ResponseBody = "{\"statusCode\":404,\"name\":\"not_found\",\"message\":\"Insights not found\"}";
        });
        var res = await client.EmailInsightsRetrieveAsync(E1);
        Assert.False(res.Success);
        Assert.Equal(404, res.Exception!.StatusCode);
        Assert.Equal("not_found", res.Exception.ErrorName);
        Assert.Equal("Insights not found", res.Exception.Message);
    }

    [Fact]
    public async Task Batch_sends_bare_array_with_idempotency()
    {
        var (client, handler) = NewClient(h => h.ResponseBody =
            "{\"data\":[{\"id\":\"11111111-1111-1111-1111-111111111111\"},{\"id\":\"22222222-2222-2222-2222-222222222222\"}]}");

        var res = await client.EmailBatchAsync(new[]
        {
            new EmailMessage { From = "a@x.dev", To = "b@x.dev", Subject = "1", Text = "one" },
            new EmailMessage { From = "a@x.dev", To = "c@x.dev", Subject = "2", Text = "two" },
        }, idempotencyKey: "batch-1");

        Assert.Equal("/emails/batch", handler.Last.Path);
        Assert.Equal(JsonValueKind.Array, handler.LastJson().ValueKind);
        Assert.Equal(2, handler.LastJson().GetArrayLength());
        Assert.Equal("batch-1", handler.Last.IdempotencyKey);
        Assert.True(res.Success);
        Assert.Equal(2, res.Content!.Data.Count);
    }

    // ---- contacts --------------------------------------------------------

    [Fact]
    public async Task Contacts_create()
    {
        var (client, handler) = NewClient();

        await client.ContactAddAsync(new ContactCreateOptions { Email = "c@x.dev", FirstName = "Ada" });
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/contacts", handler.Last.Path);
        var body = handler.LastJson();
        Assert.Equal("c@x.dev", body.GetProperty("email").GetString());
        Assert.Equal("Ada", body.GetProperty("first_name").GetString());
    }

    [Fact]
    public async Task Contacts_addressing_by_id_and_email()
    {
        var (client, handler) = NewClient();

        await client.ContactRetrieveAsync(new ContactAddress { Id = C1 });
        Assert.Equal($"/contacts/{C1}", handler.Last.Path);

        await client.ContactRetrieveAsync(new ContactAddress { Email = "c@x.dev" });
        Assert.Equal("/contacts/" + Uri.EscapeDataString("c@x.dev"), handler.Last.Path);
    }

    [Fact]
    public async Task Contacts_email_wins_over_id()
    {
        var (client, handler) = NewClient();
        await client.ContactRetrieveAsync(new ContactAddress { Id = C1, Email = "c@x.dev" });
        Assert.Equal("/contacts/" + Uri.EscapeDataString("c@x.dev"), handler.Last.Path);
    }

    [Fact]
    public async Task Contacts_update_sends_only_provided_keys()
    {
        var (client, handler) = NewClient();
        await client.ContactUpdateAsync(new ContactUpdateOptions { Id = C1, Unsubscribed = true });

        Assert.Equal("PATCH", handler.Last.Method);
        Assert.Equal($"/contacts/{C1}", handler.Last.Path);
        var body = handler.LastJson();
        Assert.True(body.GetProperty("unsubscribed").GetBoolean());
        Assert.False(body.TryGetProperty("first_name", out _));
        Assert.False(body.TryGetProperty("last_name", out _));
    }

    [Fact]
    public async Task Contacts_remove_and_list()
    {
        var (client, handler) = NewClient();

        await client.ContactDeleteAsync(new ContactAddress { Email = "c@x.dev" });
        Assert.Equal("DELETE", handler.Last.Method);
        Assert.Equal("/contacts/" + Uri.EscapeDataString("c@x.dev"), handler.Last.Path);
        Assert.Equal(string.Empty, handler.Last.Query);

        await client.ContactDeleteAsync(new ContactAddress { Id = C1 }, new ContactDeleteOptions { Erase = true });
        Assert.Equal($"/contacts/{C1}", handler.Last.Path);
        Assert.Equal("?erase=true", handler.Last.Query);

        await client.ContactListAsync(new ListOptions { After = C1 });
        Assert.Equal("/contacts", handler.Last.Path);
        Assert.Equal($"?after={C1}", handler.Last.Query);
    }

    [Fact]
    public async Task Contacts_topics_update_sends_bare_array()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $"{{\"id\":\"{C1}\"}}");
        await client.ContactTopicsUpdateAsync(new ContactTopicsUpdateOptions
        {
            Id = C1,
            Topics = new List<ContactTopicUpdate> { new() { Id = T1, Subscription = TopicSubscription.OptOut } },
        });

        Assert.Equal("PATCH", handler.Last.Method);
        Assert.Equal($"/contacts/{C1}/topics", handler.Last.Path);
        var body = handler.LastJson();
        Assert.Equal(JsonValueKind.Array, body.ValueKind);
        Assert.Equal(T1.ToString(), body[0].GetProperty("id").GetString());
        Assert.Equal("opt_out", body[0].GetProperty("subscription").GetString());
    }

    [Fact]
    public async Task Contacts_list_topics_by_email_decodes_effective_subscription()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = $$"""
            { "object": "list", "has_more": false,
              "data": [
                { "id": "{{T1}}", "name": "Insights", "description": null, "subscription": "opt_in", "explicit": false, "visibility": "public" },
                { "id": "{{S1}}", "name": "Deals", "description": "Weekly offers", "subscription": "opt_out", "explicit": true, "visibility": "private" }
              ] }
            """);

        var res = await client.ContactListTopicsAsync(new ContactAddress { Email = "c@x.dev" });

        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal("/contacts/c%40x.dev/topics", handler.Last.Path);
        Assert.Equal(string.Empty, handler.Last.Query);
        Assert.Null(handler.Last.Body);

        Assert.True(res.Success);
        Assert.Equal("list", res.Content!.Object);
        Assert.False(res.Content.HasMore);
        Assert.Equal(2, res.Content.Data.Count);

        var inherited = res.Content.Data[0];
        Assert.Equal(T1, inherited.Id);
        Assert.Equal("Insights", inherited.Name);
        Assert.Null(inherited.Description);
        Assert.Equal(TopicSubscription.OptIn, inherited.Subscription);
        Assert.False(inherited.Explicit);
        Assert.Equal(TopicVisibility.Public, inherited.Visibility);

        var chosen = res.Content.Data[1];
        Assert.Equal(S1, chosen.Id);
        Assert.Equal("Weekly offers", chosen.Description);
        Assert.Equal(TopicSubscription.OptOut, chosen.Subscription);
        Assert.True(chosen.Explicit);
        Assert.Equal(TopicVisibility.Private, chosen.Visibility);

        await client.ContactListTopicsAsync(new ContactAddress { Id = C1 });
        Assert.Equal($"/contacts/{C1}/topics", handler.Last.Path);
    }

    // ---- topics ----------------------------------------------------------

    [Fact]
    public async Task Topics_crud()
    {
        var (client, handler) = NewClient();

        await client.TopicAddAsync(new TopicCreateOptions
        {
            Name = "Product", Description = "Launches", DefaultSubscription = TopicSubscription.OptIn, Visibility = TopicVisibility.Public,
        });
        Assert.Equal("POST", handler.Last.Method);
        Assert.Equal("/topics", handler.Last.Path);
        AssertJson("""{ "name": "Product", "description": "Launches", "default_subscription": "opt_in", "visibility": "public" }""", handler.Last.Body);

        await client.TopicRetrieveAsync(T1);
        Assert.Equal($"/topics/{T1}", handler.Last.Path);

        await client.TopicListAsync();
        Assert.Equal("/topics", handler.Last.Path);
        // GET /topics is unpaginated — no query string.
        Assert.Equal(string.Empty, handler.Last.Query);

        await client.TopicDeleteAsync(T1);
        Assert.Equal("DELETE", handler.Last.Method);
    }

    // ---- broadcasts ------------------------------------------------------

    [Fact]
    public async Task Broadcasts_lifecycle()
    {
        var (client, handler) = NewClient();

        await client.BroadcastAddAsync(new BroadcastCreateOptions { SegmentId = S1, From = "a@x.dev", Subject = "News", Html = "<p>hi</p>" });
        Assert.Equal("/broadcasts", handler.Last.Path);
        var created = handler.LastJson();
        Assert.Equal(S1.ToString(), created.GetProperty("segment_id").GetString());
        Assert.Equal("a@x.dev", created.GetProperty("from").GetString());

        await client.BroadcastRetrieveAsync(B1);
        Assert.Equal($"/broadcasts/{B1}", handler.Last.Path);

        await client.BroadcastListAsync();
        Assert.Equal("/broadcasts", handler.Last.Path);

        await client.BroadcastUpdateAsync(B1, new BroadcastUpdateOptions { Subject = "New" });
        Assert.Equal("PATCH", handler.Last.Method);
        Assert.Equal($"/broadcasts/{B1}", handler.Last.Path);
        Assert.Equal("New", handler.LastJson().GetProperty("subject").GetString());

        await client.BroadcastSendAsync(B1, scheduledAt: "2999-01-01T00:00:00Z");
        Assert.Equal($"/broadcasts/{B1}/send", handler.Last.Path);
        Assert.Equal("2999-01-01T00:00:00Z", handler.LastJson().GetProperty("scheduled_at").GetString());

        await client.BroadcastSendAsync(B1);
        Assert.Equal(JsonValueKind.Object, handler.LastJson().ValueKind);
        Assert.Empty(handler.LastJson().EnumerateObject());

        await client.BroadcastCancelAsync(B1);
        Assert.Equal($"/broadcasts/{B1}/cancel", handler.Last.Path);

        await client.BroadcastDeleteAsync(B1);
        Assert.Equal("DELETE", handler.Last.Method);
    }

    // ---- segments --------------------------------------------------------

    [Fact]
    public async Task Segments_crud()
    {
        var (client, handler) = NewClient();
        var filter = new SegmentFilter
        {
            Match = SegmentMatch.All,
            Conditions = new List<SegmentCondition> { new() { Field = "email", Op = "is_set" } },
        };

        await client.SegmentAddAsync(new SegmentCreateOptions { Name = "Active", Filter = filter });
        Assert.Equal("/segments", handler.Last.Path);
        var body = handler.LastJson();
        Assert.Equal("Active", body.GetProperty("name").GetString());
        Assert.Equal("all", body.GetProperty("filter").GetProperty("match").GetString());

        await client.SegmentRetrieveAsync(S1);
        Assert.Equal($"/segments/{S1}", handler.Last.Path);

        await client.SegmentListAsync(new ListOptions { Before = S1 });
        Assert.Equal("/segments", handler.Last.Path);
        Assert.Equal($"?before={S1}", handler.Last.Query);

        await client.SegmentUpdateAsync(S1, new SegmentUpdateOptions { Name = "Renamed" });
        Assert.Equal("PATCH", handler.Last.Method);
        Assert.Equal($"/segments/{S1}", handler.Last.Path);
        var updated = handler.LastJson();
        Assert.Equal("Renamed", updated.GetProperty("name").GetString());
        Assert.False(updated.TryGetProperty("filter", out _));

        await client.SegmentDeleteAsync(S1);
        Assert.Equal("DELETE", handler.Last.Method);
    }

    // ---- deliverability --------------------------------------------------

    [Fact]
    public async Task Deliverability_maps_path_and_deserializes()
    {
        var (client, handler) = NewClient(h => h.ResponseBody = """
            {
              "object": "deliverability",
              "score": 8.7, "band": "good",
              "content_score": 8.2, "outcome_score": 9.1,
              "complaint_rate": 0.0002, "hard_bounce_rate": 0.001,
              "emails_sent": 12345, "scored_recipients": 23456,
              "window_days": 30, "insufficient_outcome_data": false,
              "guardrail_status": "ok", "score_version": 1
            }
            """);

        var res = await client.DeliverabilityRetrieveAsync();
        Assert.Equal("GET", handler.Last.Method);
        Assert.Equal("/deliverability", handler.Last.Path);
        Assert.True(res.Success);

        var d = res.Content!;
        Assert.Equal("deliverability", d.Object);
        Assert.Equal(8.7, d.Score);
        Assert.Equal("good", d.Band);
        Assert.Equal(8.2, d.ContentScore);
        Assert.Equal(9.1, d.OutcomeScore);
        Assert.Equal(0.0002, d.ComplaintRate);
        Assert.Equal(0.001, d.HardBounceRate);
        Assert.Equal(12345, d.EmailsSent);
        Assert.Equal(23456, d.ScoredRecipients);
        Assert.Equal(30, d.WindowDays);
        Assert.False(d.InsufficientOutcomeData);
        Assert.Equal("ok", d.GuardrailStatus);
        Assert.Equal(1, d.ScoreVersion);
    }

    [Fact]
    public async Task Deliverability_null_scores_and_unknown_guardrail_tolerated()
    {
        var (client, _) = NewClient(h => h.ResponseBody = """
            {
              "object": "deliverability",
              "score": null, "band": null,
              "content_score": null, "outcome_score": null,
              "complaint_rate": 0, "hard_bounce_rate": 0,
              "emails_sent": 0, "scored_recipients": 0,
              "window_days": 30, "insufficient_outcome_data": true,
              "guardrail_status": "throttled", "score_version": 1
            }
            """);

        var res = await client.DeliverabilityRetrieveAsync();
        Assert.True(res.Success);
        var d = res.Content!;
        Assert.Null(d.Score);
        Assert.Null(d.Band);
        Assert.Null(d.ContentScore);
        Assert.Null(d.OutcomeScore);
        Assert.True(d.InsufficientOutcomeData);
        // guardrail_status is an open set; a future value stays a plain string.
        Assert.Equal("throttled", d.GuardrailStatus);
    }

    // ---- errors ----------------------------------------------------------

    [Fact]
    public async Task ApiError_is_parsed_into_exception()
    {
        var (client, handler) = NewClient(h =>
        {
            h.Status = HttpStatusCode.UnprocessableEntity;
            h.ResponseBody = "{\"statusCode\":422,\"name\":\"validation_error\",\"message\":\"bad input\"}";
        });

        var res = await client.TopicRetrieveAsync(T1);
        Assert.False(res.Success);
        Assert.Null(res.Content);
        Assert.NotNull(res.Exception);
        Assert.Equal(422, res.Exception!.StatusCode);
        Assert.Equal("validation_error", res.Exception.ErrorName);
        Assert.Equal("bad input", res.Exception.Message);
    }

    [Fact]
    public async Task AllRecipientsSuppressed_surfaces_its_error_name()
    {
        var (client, handler) = NewClient(h =>
        {
            h.Status = HttpStatusCode.UnprocessableEntity;
            h.ResponseBody = "{\"statusCode\":422,\"name\":\"all_recipients_suppressed\",\"message\":\"All recipients are suppressed\"}";
        });

        var res = await client.EmailSendAsync(new EmailMessage { From = "a@x.dev", To = "b@x.dev", Subject = "s", TopicId = T1 });
        Assert.Equal("/emails", handler.Last.Path);
        Assert.False(res.Success);
        Assert.Equal(422, res.Exception!.StatusCode);
        Assert.Equal("all_recipients_suppressed", res.Exception.ErrorName);
        Assert.Equal("All recipients are suppressed", res.Exception.Message);
    }

    [Fact]
    public async Task NonJson_error_body_falls_back_to_status()
    {
        var (client, handler) = NewClient(h =>
        {
            h.Status = HttpStatusCode.InternalServerError;
            h.ResponseBody = "oops, not json";
        });

        var res = await client.TopicRetrieveAsync(T1);
        Assert.False(res.Success);
        Assert.Equal(500, res.Exception!.StatusCode);
        Assert.Equal("application_error", res.Exception.ErrorName);
        Assert.Equal("Request failed with status 500", res.Exception.Message);
    }

    [Fact]
    public async Task TransportError_has_null_status()
    {
        var (client, _) = NewClient(h => h.Throw = new HttpRequestException("connection refused"));

        var res = await client.TopicRetrieveAsync(T1);
        Assert.False(res.Success);
        Assert.Null(res.Exception!.StatusCode);
        Assert.Equal("application_error", res.Exception.ErrorName);
        Assert.Equal("connection refused", res.Exception.Message);
    }
}
