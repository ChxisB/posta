using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MillionSend;

// Inputs are PascalCase and mapped to the wire's snake_case by the shared
// JsonSerializerOptions (JsonNamingPolicy.SnakeCaseLower). Responses are the wire
// shape verbatim, deserialized by the same policy.

// ---- shared --------------------------------------------------------------

/// <summary>One or more email addresses. Assign a <see cref="string"/> or a
/// <c>string[]</c>/<c>List&lt;string&gt;</c> directly.</summary>
[JsonConverter(typeof(RecipientsConverter))]
public sealed class Recipients
{
    private readonly string? _single;
    private readonly IReadOnlyList<string>? _many;

    private Recipients(string single) => _single = single;
    private Recipients(IReadOnlyList<string> many) => _many = many;

    public static implicit operator Recipients(string value) => new(value);
    public static implicit operator Recipients(string[] values) => new(values);
    public static implicit operator Recipients(List<string> values) => new(values);

    internal void Write(Utf8JsonWriter writer, JsonSerializerOptions options)
    {
        if (_single is not null) writer.WriteStringValue(_single);
        else JsonSerializer.Serialize(writer, _many, options);
    }
}

internal sealed class RecipientsConverter : JsonConverter<Recipients>
{
    public override Recipients Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
            return reader.GetString()!;
        var list = JsonSerializer.Deserialize<List<string>>(ref reader, options) ?? new List<string>();
        return list;
    }

    public override void Write(Utf8JsonWriter writer, Recipients value, JsonSerializerOptions options)
        => value.Write(writer, options);
}

/// <summary>
/// Tri-state PATCH field. Left unset (or assigned a C# <c>null</c>) the field is
/// omitted from the body and the server leaves it unchanged; assigned a value it is
/// sent as-is; assigned <see cref="Null"/> it is sent as JSON <c>null</c>, which
/// clears the stored value. Plain values convert implicitly.
/// </summary>
[JsonConverter(typeof(OptionalConverterFactory))]
public sealed class Optional<T>
{
    public T? Value { get; }

    internal Optional(T? value) => Value = value;

    /// <summary>Explicit JSON <c>null</c>: clears the field on the server.</summary>
    public static Optional<T> Null { get; } = new(default);

    public static implicit operator Optional<T>?(T? value) => value is null ? null : new(value);
}

internal sealed class OptionalConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert)
        => typeToConvert.IsGenericType && typeToConvert.GetGenericTypeDefinition() == typeof(Optional<>);

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
        => (JsonConverter)Activator.CreateInstance(
            typeof(OptionalConverter<>).MakeGenericType(typeToConvert.GetGenericArguments()[0]))!;
}

internal sealed class OptionalConverter<T> : JsonConverter<Optional<T>>
{
    public override Optional<T> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => new(JsonSerializer.Deserialize<T>(ref reader, options));

    public override void Write(Utf8JsonWriter writer, Optional<T> value, JsonSerializerOptions options)
    {
        if (value.Value is null) writer.WriteNullValue();
        else JsonSerializer.Serialize(writer, value.Value, options);
    }
}

public sealed class Tag
{
    public string Name { get; init; } = string.Empty;
    public string Value { get; init; } = string.Empty;
}

/// <summary>Keyset list options. <see cref="After"/> and <see cref="Before"/> are
/// mutually exclusive cursors.</summary>
public class ListOptions
{
    /// <summary>1–100; the API defaults to 20.</summary>
    public int? Limit { get; init; }
    public Guid? After { get; init; }
    public Guid? Before { get; init; }
}

public enum TopicSubscription { OptIn, OptOut }
public enum SegmentMatch { All, Any }

/// <summary>The <c>x-batch-validation</c> header on batch endpoints. <c>Strict</c>
/// (the server default) rejects the whole batch on one invalid item; <c>Permissive</c>
/// writes the valid items and reports the rest in <c>errors</c>.</summary>
public enum BatchValidationMode { Strict, Permissive }

public enum ContactBatchOnConflict { Error, Skip, Upsert }
/// <summary>Facets a contact list row or batch read can carry (<c>include=properties,topics</c>).</summary>
public enum ContactInclude { Properties, Topics }
public enum SuppressionOrigin { Bounce, Complaint, Manual, Unsubscribe }
public enum ApiKeyPermission { FullAccess, SendingAccess }
public enum WebhookStatus { Enabled, Disabled }
public enum ContactPropertyType { String, Number }
public enum TopicVisibility { Private, Public }

/// <summary><c>{ object, id }</c> acknowledgement returned by create/update actions.</summary>
public sealed class ObjectId
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
}

/// <summary><c>{ object, id, deleted }</c> acknowledgement returned by delete actions.</summary>
public sealed class DeletedResponse
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public bool Deleted { get; init; }
}

/// <summary>One rejected batch item (permissive validation only).</summary>
public sealed class BatchError
{
    /// <summary>Position of the item in the request array.</summary>
    public int Index { get; init; }
    public string? Message { get; init; }
}

/// <summary>Envelope for endpoints that return a bare <c>{ "data": [...] }</c>
/// (batch send, topics list, suppression batches).</summary>
public sealed class DataResponse<T>
{
    public List<T> Data { get; init; } = new();
    /// <summary>Rejected items; present only for a batch sent with
    /// <see cref="BatchValidationMode.Permissive"/>.</summary>
    public List<BatchError>? Errors { get; init; }
}

/// <summary>Paginated list envelope: <c>{ object:"list", data:[], has_more }</c>.</summary>
public sealed class ListResponse<T>
{
    public string? Object { get; init; }
    public List<T> Data { get; init; } = new();
    public bool HasMore { get; init; }
}

// ---- emails --------------------------------------------------------------

public sealed class EmailAttachment
{
    public string Filename { get; init; } = string.Empty;
    /// <summary>Base64-encoded file content.</summary>
    public string? Content { get; init; }
    public string? ContentType { get; init; }
    /// <summary>Content-ID for inline images (<c>cid:</c> references in the HTML).</summary>
    public string? ContentId { get; init; }
    public string? Path { get; init; }
}

/// <summary>Resend's template reference. Passed through verbatim; the server answers
/// 422 until template-based sending ships.</summary>
public sealed class EmailMessageTemplate
{
    [JsonPropertyName("id")] public string TemplateId { get; init; } = string.Empty;
    public Dictionary<string, object?>? Variables { get; init; }
}

public sealed class EmailMessage
{
    public string From { get; init; } = string.Empty;
    public Recipients To { get; init; } = null!;
    public string Subject { get; init; } = string.Empty;
    public string? Html { get; init; }
    public string? Text { get; init; }
    public Recipients? Cc { get; init; }
    public Recipients? Bcc { get; init; }
    public Recipients? ReplyTo { get; init; }
    /// <summary>ISO 8601 with offset; up to 30 days ahead.</summary>
    public string? ScheduledAt { get; init; }
    public List<Tag>? Tags { get; init; }
    /// <summary>Topic-scoped send: recipients opted out of the topic are skipped.</summary>
    public Guid? TopicId { get; init; }
    public List<EmailAttachment>? Attachments { get; init; }
    /// <summary>Extra message headers; transport headers are rejected by the API.</summary>
    public Dictionary<string, string>? Headers { get; init; }
    public EmailMessageTemplate? Template { get; init; }
}

public sealed class CreateEmailResponse
{
    public Guid Id { get; init; }
}

public sealed class Email
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public string? From { get; init; }
    public List<string>? To { get; init; }
    public List<string>? Cc { get; init; }
    public List<string>? Bcc { get; init; }
    public List<string>? ReplyTo { get; init; }
    public string? Subject { get; init; }
    public string? Html { get; init; }
    public string? Text { get; init; }
    public string? CreatedAt { get; init; }
    public string? ScheduledAt { get; init; }
    public string? MessageId { get; init; }
    public string? LastEvent { get; init; }
    /// <summary>Best-practice score (0–10, one decimal); null when the email has no insights.</summary>
    public double? Score { get; init; }
}

// Band, severity, status, and guardrail_status are open string sets on the
// wire (new values arrive with new score versions); strict enum binding would
// make a future value throw, so they stay strings.

public sealed class InsightCheck
{
    /// <summary>Check id from the server's check catalog (open set).</summary>
    public string? Id { get; init; }
    public string? Severity { get; init; }
    public string? Status { get; init; }
    /// <summary>Points deducted from the score; 0 unless status is <c>fail</c>.</summary>
    public double Penalty { get; init; }
    /// <summary>Free-form JSON with check-specific context; absent for most checks.</summary>
    public Dictionary<string, object?>? Detail { get; init; }
}

/// <summary>The pre-send best-practice report computed when the email was sent.</summary>
public sealed class EmailInsights
{
    public string? Object { get; init; }
    public Guid EmailId { get; init; }
    /// <summary>Best-practice score, 0–10, one decimal.</summary>
    public double Score { get; init; }
    public int ScoreVersion { get; init; }
    public string? Band { get; init; }
    public bool Marketing { get; init; }
    public int? HtmlSizeBytes { get; init; }
    public string? ComputedAt { get; init; }
    public List<InsightCheck> Checks { get; init; } = new();
}

/// <summary>Account deliverability over the trailing window. Scores are 0–10
/// with one decimal; null means not enough data to compute.</summary>
public sealed class Deliverability
{
    public string? Object { get; init; }
    public double? Score { get; init; }
    public string? Band { get; init; }
    public double? ContentScore { get; init; }
    public double? OutcomeScore { get; init; }
    public double ComplaintRate { get; init; }
    public double HardBounceRate { get; init; }
    public long EmailsSent { get; init; }
    public long ScoredRecipients { get; init; }
    public int WindowDays { get; init; }
    public bool InsufficientOutcomeData { get; init; }
    public string? GuardrailStatus { get; init; }
    public int ScoreVersion { get; init; }
}

public sealed class CancelEmailResponse
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
}

// ---- contacts (team-global) ----------------------------------------------

public sealed class SegmentRef
{
    public Guid Id { get; init; }
}

public sealed class ContactCreateOptions
{
    public string Email { get; init; } = string.Empty;
    public string? FirstName { get; init; }
    public string? LastName { get; init; }
    public bool? Unsubscribed { get; init; }
    public Dictionary<string, object?>? Properties { get; init; }
    public List<SegmentRef>? Segments { get; init; }
    public List<ContactTopicUpdate>? Topics { get; init; }
}

/// <summary>Addresses a contact by id or email (email wins when both are set).</summary>
public sealed class ContactAddress
{
    public Guid? Id { get; init; }
    public string? Email { get; init; }
}

/// <summary>Options for <c>DELETE /contacts/{id}</c> and <c>POST /contacts/batch/remove</c>.</summary>
public sealed class ContactDeleteOptions
{
    /// <summary>
    /// A plain delete keeps the contact's emails in the send log. With <c>true</c> the address is also
    /// scrubbed from email history, event payloads and API logs (a GDPR/LGPD erasure).
    /// </summary>
    public bool? Erase { get; init; }
}

/// <summary>List options for <c>GET /contacts</c> and <c>GET /segments/{id}/contacts</c>.</summary>
public sealed class ContactListOptions : ListOptions
{
    /// <summary>Attach <see cref="ContactListItem.Properties"/> and/or <see cref="ContactListItem.Topics"/> to every row.</summary>
    public List<ContactInclude>? Include { get; init; }
}

public sealed class ContactUpdateOptions
{
    [JsonIgnore] public Guid? Id { get; init; }
    [JsonIgnore] public string? Email { get; init; }
    /// <summary>Assign a string, or <c>Optional&lt;string&gt;.Null</c> to clear.</summary>
    public Optional<string>? FirstName { get; init; }
    public Optional<string>? LastName { get; init; }
    public bool? Unsubscribed { get; init; }
    /// <summary>Merged into the contact's properties; a <c>null</c> value clears that key.</summary>
    public Dictionary<string, object?>? Properties { get; init; }
}

/// <summary>Query and header options for <c>POST /contacts/batch</c>.</summary>
public sealed class ContactBatchOptions
{
    /// <summary>What to do with an email that already belongs to a contact (server default: error).</summary>
    public ContactBatchOnConflict? OnConflict { get; init; }
    public BatchValidationMode? Validation { get; init; }
}

/// <summary>Body options for <c>POST /contacts/batch/get</c>.</summary>
public sealed class ContactBatchGetOptions
{
    /// <summary>Attach <see cref="ContactListItem.Properties"/> and/or <see cref="ContactListItem.Topics"/> to every contact.</summary>
    public List<ContactInclude>? Include { get; init; }
}

public sealed class ContactBatchItem
{
    public string? Object { get; init; }
    /// <summary>Position of the item in the request array.</summary>
    public int Index { get; init; }
    /// <summary>The contact's id (the existing one for skipped/updated).</summary>
    public Guid Id { get; init; }
    /// <summary><c>created</c>, <c>updated</c> or <c>skipped</c>.</summary>
    public string? Status { get; init; }
}

public sealed class ContactBatchCounts
{
    public int Created { get; init; }
    public int Updated { get; init; }
    public int Skipped { get; init; }
    public int Failed { get; init; }
}

public sealed class ContactBatchResponse
{
    public List<ContactBatchItem> Data { get; init; } = new();
    public ContactBatchCounts Counts { get; init; } = new();
    /// <summary>Rejected items; present only with <see cref="BatchValidationMode.Permissive"/>.</summary>
    public List<BatchError>? Errors { get; init; }
}

public sealed class ContactId
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
}

public sealed class Contact
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public string? Email { get; init; }
    public string? FirstName { get; init; }
    public string? LastName { get; init; }
    public string? CreatedAt { get; init; }
    public bool Unsubscribed { get; init; }
    /// <summary>Typed values as returned by the API: <c>{ "type": "string"|"number", "value": ... }</c> per key.</summary>
    public Dictionary<string, object?>? Properties { get; init; }
}

public class ContactListItem
{
    public Guid Id { get; init; }
    public string? Email { get; init; }
    public string? FirstName { get; init; }
    public string? LastName { get; init; }
    public string? CreatedAt { get; init; }
    public bool Unsubscribed { get; init; }
    /// <summary>Only with <see cref="ContactInclude.Properties"/>; the same typed map as <see cref="Contact.Properties"/>.</summary>
    public Dictionary<string, object?>? Properties { get; init; }
    /// <summary>Only with <see cref="ContactInclude.Topics"/>; the same rows as <c>ContactListTopicsAsync</c>.</summary>
    public List<ContactTopic>? Topics { get; init; }
}

/// <summary>One contact as <c>ContactBatchGetAsync</c> returns it: the list row plus <c>object</c>.</summary>
public sealed class ContactBatchGetItem : ContactListItem
{
    public string? Object { get; init; }
}

/// <summary>A batch-get request entry that matched no contact.</summary>
public sealed class ContactBatchGetMissing
{
    /// <summary>Position of the entry in the request array.</summary>
    public int Index { get; init; }
    public Guid? Id { get; init; }
    public string? Email { get; init; }
}

public sealed class ContactBatchGetResponse
{
    public string? Object { get; init; }
    /// <summary>The contacts found, in request order.</summary>
    public List<ContactBatchGetItem> Data { get; init; } = new();
    public List<ContactBatchGetMissing> Missing { get; init; } = new();
}

public sealed class RemoveContactResponse
{
    public string? Object { get; init; }
    public string? Contact { get; init; }
    public bool Deleted { get; init; }
}

public sealed class ContactTopicUpdate
{
    public Guid Id { get; init; }
    public TopicSubscription Subscription { get; init; }
}

public sealed class ContactTopicsUpdateOptions
{
    public Guid? Id { get; init; }
    public string? Email { get; init; }
    public List<ContactTopicUpdate> Topics { get; init; } = new();
}

/// <summary>A topic as one contact sees it. <see cref="Subscription"/> is the
/// effective choice: the contact's own when <see cref="Explicit"/> is true,
/// otherwise the topic's default.</summary>
public sealed class ContactTopic
{
    public Guid Id { get; init; }
    public string? Name { get; init; }
    public string? Description { get; init; }
    public TopicSubscription Subscription { get; init; }
    public bool Explicit { get; init; }
    /// <summary>The hosted preference page lists public topics only.</summary>
    public TopicVisibility? Visibility { get; init; }
}

/// <summary>A contact's hosted preference page. The URL is a signed, contact-scoped
/// capability with no expiry: hand it only to the contact.</summary>
public sealed class ContactPreferencesLink
{
    public string? Object { get; init; }
    public Guid Contact { get; init; }
    public string? Url { get; init; }
}

// ---- contact properties --------------------------------------------------

public sealed class ContactPropertyCreateOptions
{
    public string Key { get; init; } = string.Empty;
    public ContactPropertyType Type { get; init; }
    /// <summary>A string or a number, substituted when a contact has no value.</summary>
    public object? FallbackValue { get; init; }
}

public sealed class ContactPropertyUpdateOptions
{
    /// <summary>A string or number, or <c>Optional&lt;object&gt;.Null</c> to clear.</summary>
    public Optional<object>? FallbackValue { get; init; }
}

public sealed class ContactProperty
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public string? Key { get; init; }
    public ContactPropertyType Type { get; init; }
    /// <summary>A string, a number or <c>null</c> (a <see cref="JsonElement"/> after deserialization).</summary>
    public object? FallbackValue { get; init; }
    public string? CreatedAt { get; init; }
}

// ---- topics --------------------------------------------------------------

public sealed class TopicCreateOptions
{
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public TopicSubscription DefaultSubscription { get; init; }
    /// <summary>Public topics always appear on the unsubscribe page; private ones (the server default) only when reached through their own topic link.</summary>
    public TopicVisibility? Visibility { get; init; }
}

public sealed class TopicUpdateOptions
{
    public string? Name { get; init; }
    public string? Description { get; init; }
    public TopicVisibility? Visibility { get; init; }
}

public sealed class Topic
{
    public Guid Id { get; init; }
    public string? Name { get; init; }
    public string? Description { get; init; }
    public TopicSubscription DefaultSubscription { get; init; }
    public TopicVisibility? Visibility { get; init; }
    public string? CreatedAt { get; init; }
}

public sealed class TopicId
{
    public Guid Id { get; init; }
}

public sealed class RemoveTopicResponse
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public bool Deleted { get; init; }
}

// ---- broadcasts ----------------------------------------------------------

/// <summary>Targeting is an optional <see cref="SegmentId"/> and/or
/// <see cref="TopicId"/>; neither set sends to every contact of the team.</summary>
public sealed class BroadcastCreateOptions
{
    public string? Name { get; init; }
    public Guid? SegmentId { get; init; }
    public string From { get; init; } = string.Empty;
    public string Subject { get; init; } = string.Empty;
    public string? Html { get; init; }
    public string? Text { get; init; }
    public Recipients? ReplyTo { get; init; }
    public string? PreviewText { get; init; }
    public Guid? TopicId { get; init; }
    /// <summary>true sends (or schedules) immediately instead of saving a draft.</summary>
    public bool? Send { get; init; }
    /// <summary>Deliver later; requires <see cref="Send"/> = true.</summary>
    public string? ScheduledAt { get; init; }
}

public sealed class BroadcastUpdateOptions
{
    public string? Name { get; init; }
    public Guid? SegmentId { get; init; }
    public string? From { get; init; }
    public string? Subject { get; init; }
    public string? Html { get; init; }
    public string? Text { get; init; }
    public Recipients? ReplyTo { get; init; }
    public string? PreviewText { get; init; }
    /// <summary>Assign a Guid, or <c>Optional&lt;Guid?&gt;.Null</c> to remove the topic.</summary>
    public Optional<Guid?>? TopicId { get; init; }
}

public sealed class BroadcastId
{
    public Guid Id { get; init; }
}

public class BroadcastListItem
{
    public Guid Id { get; init; }
    public string? Name { get; init; }
    public Guid? SegmentId { get; init; }
    public string? Status { get; init; }
    public string? CreatedAt { get; init; }
    public string? ScheduledAt { get; init; }
    public string? SentAt { get; init; }
}

public sealed class Broadcast : BroadcastListItem
{
    public string? Object { get; init; }
    public string? From { get; init; }
    public string? Subject { get; init; }
    public List<string>? ReplyTo { get; init; }
    public string? PreviewText { get; init; }
    public Guid? TopicId { get; init; }
    public string? Html { get; init; }
    public string? Text { get; init; }
}

public sealed class CancelBroadcastResponse
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
}

public sealed class RemoveBroadcastResponse
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public bool Deleted { get; init; }
}

// ---- segments (saved filters over the team's contacts) -------------------

public sealed class SegmentCondition
{
    public string Field { get; init; } = string.Empty;
    public string Op { get; init; } = string.Empty;
    public string? Value { get; init; }
}

public sealed class SegmentFilter
{
    public SegmentMatch Match { get; init; }
    public List<SegmentCondition> Conditions { get; init; } = new();
}

public sealed class SegmentCreateOptions
{
    public string Name { get; init; } = string.Empty;
    public SegmentFilter Filter { get; init; } = new();
}

public sealed class SegmentUpdateOptions
{
    public string? Name { get; init; }
    public SegmentFilter? Filter { get; init; }
}

public sealed class Segment
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public string? Name { get; init; }
    public SegmentFilter? Filter { get; init; }
    public string? CreatedAt { get; init; }
    public int? ContactCount { get; init; }
}

public sealed class RemoveSegmentResponse
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public bool Deleted { get; init; }
}

// ---- suppressions --------------------------------------------------------

public sealed class SuppressionListOptions : ListOptions
{
    public SuppressionOrigin? Origin { get; init; }
}

public sealed class Suppression
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public string? Email { get; init; }
    public SuppressionOrigin Origin { get; init; }
    /// <summary>The email or broadcast that caused the suppression, when known.</summary>
    public Guid? SourceId { get; init; }
    public string? CreatedAt { get; init; }
}

// ---- domains -------------------------------------------------------------

public sealed class DomainCreateOptions
{
    public string Name { get; init; } = string.Empty;
    /// <summary>Sending region, e.g. <c>us-east-1</c>; the instance default when omitted.</summary>
    public string? Region { get; init; }
    /// <summary>Subdomain for the Return-Path (server default: <c>send</c>).</summary>
    public string? CustomReturnPath { get; init; }
    public bool? OpenTracking { get; init; }
    public bool? ClickTracking { get; init; }
    public string? TrackingSubdomain { get; init; }
}

public sealed class DomainUpdateOptions
{
    public bool? OpenTracking { get; init; }
    public bool? ClickTracking { get; init; }
    /// <summary>Assign a string, or <c>Optional&lt;string&gt;.Null</c> to clear.</summary>
    public Optional<string>? TrackingSubdomain { get; init; }
}

public sealed class DomainCapabilities
{
    public string? Sending { get; init; }
    public string? Receiving { get; init; }
}

public sealed class DomainRecord
{
    public string? Record { get; init; }
    public string? Name { get; init; }
    public string? Type { get; init; }
    public string? Ttl { get; init; }
    public string? Status { get; init; }
    public string? Value { get; init; }
    public double? Priority { get; init; }
}

public sealed class Domain
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public string? Name { get; init; }
    public string? Status { get; init; }
    public string? CreatedAt { get; init; }
    public string? Region { get; init; }
    public bool OpenTracking { get; init; }
    public bool ClickTracking { get; init; }
    public string? TrackingSubdomain { get; init; }
    public DomainCapabilities? Capabilities { get; init; }
    /// <summary>DNS records to publish; absent on list items.</summary>
    public List<DomainRecord>? Records { get; init; }
}

// ---- webhooks ------------------------------------------------------------

public sealed class WebhookCreateOptions
{
    public string Endpoint { get; init; } = string.Empty;
    /// <summary>Event names such as <c>email.delivered</c>.</summary>
    public List<string> Events { get; init; } = new();
    /// <summary>Bring your own signing secret; generated by the server when omitted.</summary>
    public string? SigningSecret { get; init; }
}

public sealed class WebhookUpdateOptions
{
    public string? Endpoint { get; init; }
    public List<string>? Events { get; init; }
    public WebhookStatus? Status { get; init; }
}

public sealed class WebhookCreateResponse
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public string? SigningSecret { get; init; }
}

/// <summary>Both fields optional: an empty body mints a secret with the server's default overlap.</summary>
public sealed class WebhookRotateOptions
{
    /// <summary>Bring your own secret: <c>whsec_</c> followed by base64 of 24–64 bytes; minted when omitted.</summary>
    public string? SigningSecret { get; init; }
    /// <summary>0–72 hours the previous secret keeps signing alongside the new one; 0 drops it at once.</summary>
    public int? OverlapHours { get; init; }
}

public sealed class WebhookRotateResponse
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public string? SigningSecret { get; init; }
    /// <summary>When the previous secret stops signing; null when it was dropped at once.</summary>
    public string? PreviousSecretExpiresAt { get; init; }
}

public sealed class Webhook
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public string? Endpoint { get; init; }
    public string? CreatedAt { get; init; }
    public WebhookStatus Status { get; init; }
    public List<string>? Events { get; init; }
    /// <summary>Returned by retrieve only; absent on list items.</summary>
    public string? SigningSecret { get; init; }
    /// <summary>Retrieve only. While set, deliveries are also signed with the secret this one replaced (a rotation's overlap window).</summary>
    public string? PreviousSecretExpiresAt { get; init; }
}

// ---- api keys ------------------------------------------------------------

public sealed class ApiKeyCreateResponse
{
    public Guid Id { get; init; }
    /// <summary>The bearer token; shown once, never retrievable again.</summary>
    public string? Token { get; init; }
}

public sealed class ApiKey
{
    public Guid Id { get; init; }
    public string? Name { get; init; }
    public string? CreatedAt { get; init; }
    public string? LastUsedAt { get; init; }
}

// ---- templates -----------------------------------------------------------

public sealed class TemplateCreateOptions
{
    public string Name { get; init; } = string.Empty;
    public string Html { get; init; } = string.Empty;
    public string? Subject { get; init; }
    public string? Text { get; init; }
    /// <summary>Case-sensitive handle, unique per team; <c>TemplateRetrieveAsync(alias)</c> resolves it.</summary>
    public string? Alias { get; init; }
}

public sealed class TemplateUpdateOptions
{
    public string? Name { get; init; }
    public string? Html { get; init; }
    /// <summary>Assign a string, or <c>Optional&lt;string&gt;.Null</c> to clear.</summary>
    public Optional<string>? Subject { get; init; }
    public Optional<string>? Text { get; init; }
    public Optional<string>? Alias { get; init; }
}

public sealed class Template
{
    public string? Object { get; init; }
    public Guid Id { get; init; }
    public string? Name { get; init; }
    public string? Alias { get; init; }
    public string? Status { get; init; }
    public string? PublishedAt { get; init; }
    public string? CreatedAt { get; init; }
    public string? UpdatedAt { get; init; }
    public Guid? CurrentVersionId { get; init; }
    public string? Subject { get; init; }
    /// <summary>Absent on list items.</summary>
    public string? Html { get; init; }
    public string? Text { get; init; }
    public bool HasUnpublishedVersions { get; init; }
}

// ---- usage ---------------------------------------------------------------

public sealed class UsageLimits
{
    /// <summary>null means unlimited.</summary>
    public int? EmailsPerDay { get; init; }
    public int? Domains { get; init; }
}

public sealed class UsageToday
{
    public long EmailsSent { get; init; }
    public string? ResetsAt { get; init; }
}

public sealed class UsageTeam
{
    public Guid Id { get; init; }
    public string? Name { get; init; }
}

/// <summary>Plan limits and today's consumption for the calling team.</summary>
public sealed class Usage
{
    public string? Object { get; init; }
    public bool Cloud { get; init; }
    /// <summary><c>free</c>, <c>pro</c>, <c>scale</c>, or null for self-hosted.</summary>
    public string? Plan { get; init; }
    public UsageLimits Limits { get; init; } = new();
    public UsageToday Today { get; init; } = new();
    public UsageTeam Team { get; init; } = new();
    public string? AppUrl { get; init; }
}

// ---- internal ------------------------------------------------------------

// The API's non-2xx body. `statusCode` is camelCase on the wire (unlike the
// snake_case success bodies), so it needs an explicit name.
internal sealed class ErrorBody
{
    [JsonPropertyName("statusCode")] public int? StatusCode { get; init; }
    public string? Name { get; init; }
    public string? Message { get; init; }
}
