using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MillionSend;

/// <summary>
/// The MillionSend API surface. Every method returns a
/// <see cref="MillionSendResponse{T}"/> and never throws for an API or transport
/// error. Method names follow resend-dotnet; segments, usage, insights and
/// deliverability are MillionSend extensions.
/// </summary>
public interface IMillionSend
{
    // Emails
    Task<MillionSendResponse<CreateEmailResponse>> EmailSendAsync(EmailMessage message, string? idempotencyKey = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<CreateEmailResponse>> EmailSendAsync(string idempotencyKey, EmailMessage message, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<Email>> EmailRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ListResponse<Email>>> EmailListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    /// <summary>Reschedule a scheduled email (PATCH /emails/{id}).</summary>
    Task<MillionSendResponse<ObjectId>> EmailRescheduleAsync(Guid id, string scheduledAt, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DeletedResponse>> EmailDeleteAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<EmailInsights>> EmailInsightsRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<CancelEmailResponse>> EmailCancelAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DataResponse<CreateEmailResponse>>> EmailBatchAsync(IEnumerable<EmailMessage> messages, string? idempotencyKey = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DataResponse<CreateEmailResponse>>> EmailBatchAsync(string idempotencyKey, IEnumerable<EmailMessage> messages, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DataResponse<CreateEmailResponse>>> EmailBatchAsync(IEnumerable<EmailMessage> messages, BatchValidationMode validation, string? idempotencyKey = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DataResponse<CreateEmailResponse>>> EmailBatchAsync(string idempotencyKey, IEnumerable<EmailMessage> messages, BatchValidationMode validation, CancellationToken cancellationToken = default);

    // Contacts (team-global)
    Task<MillionSendResponse<ContactId>> ContactAddAsync(ContactCreateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ContactBatchResponse>> ContactBatchAsync(IEnumerable<ContactCreateOptions> contacts, ContactBatchOptions? options = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<Contact>> ContactRetrieveAsync(ContactAddress address, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ContactId>> ContactUpdateAsync(ContactUpdateOptions options, CancellationToken cancellationToken = default);
    /// <summary>Delete a contact; its emails stay in the send log unless <see cref="ContactDeleteOptions.Erase"/> is set.</summary>
    Task<MillionSendResponse<RemoveContactResponse>> ContactDeleteAsync(ContactAddress address, ContactDeleteOptions? options = null, CancellationToken cancellationToken = default);
    /// <summary>Delete up to 1000 contacts by email (POST /contacts/batch/remove); lists only the rows actually deleted.</summary>
    Task<MillionSendResponse<DataResponse<RemoveContactResponse>>> ContactBatchRemoveAsync(IEnumerable<string> emails, ContactDeleteOptions? options = null, CancellationToken cancellationToken = default);
    /// <summary>Delete up to 1000 contacts by id (POST /contacts/batch/remove); lists only the rows actually deleted.</summary>
    Task<MillionSendResponse<DataResponse<RemoveContactResponse>>> ContactBatchRemoveAsync(IEnumerable<Guid> ids, ContactDeleteOptions? options = null, CancellationToken cancellationToken = default);
    /// <summary>Read up to 1000 contacts by id or email in one request (POST /contacts/batch/get), in request order; entries that match no contact come back under <c>Missing</c>.</summary>
    Task<MillionSendResponse<ContactBatchGetResponse>> ContactBatchGetAsync(IEnumerable<ContactAddress> addresses, ContactBatchGetOptions? options = null, CancellationToken cancellationToken = default);
    /// <param name="options">Pass a <see cref="ContactListOptions"/> to attach properties and/or topics to every row.</param>
    Task<MillionSendResponse<ListResponse<ContactListItem>>> ContactListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ContactId>> ContactTopicsUpdateAsync(ContactTopicsUpdateOptions options, CancellationToken cancellationToken = default);
    /// <summary>Every topic with the contact's effective subscription (GET /contacts/{id}/topics).</summary>
    Task<MillionSendResponse<ListResponse<ContactTopic>>> ContactListTopicsAsync(ContactAddress address, CancellationToken cancellationToken = default);
    /// <summary>Mint the contact's hosted preference-page URL (POST /contacts/{id}/preferences-link). 422 when the instance cannot build hosted links.</summary>
    Task<MillionSendResponse<ContactPreferencesLink>> ContactPreferencesLinkAsync(ContactAddress address, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ObjectId>> ContactAddToSegmentAsync(ContactAddress address, Guid segmentId, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DeletedResponse>> ContactRemoveFromSegmentAsync(ContactAddress address, Guid segmentId, CancellationToken cancellationToken = default);

    // Contact properties
    Task<MillionSendResponse<ContactProperty>> ContactPropCreateAsync(ContactPropertyCreateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ListResponse<ContactProperty>>> ContactPropListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ContactProperty>> ContactPropRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ObjectId>> ContactPropUpdateAsync(Guid id, ContactPropertyUpdateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DeletedResponse>> ContactPropDeleteAsync(Guid id, CancellationToken cancellationToken = default);

    // Topics
    Task<MillionSendResponse<TopicId>> TopicAddAsync(TopicCreateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<Topic>> TopicRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DataResponse<Topic>>> TopicListAsync(CancellationToken cancellationToken = default);
    Task<MillionSendResponse<TopicId>> TopicUpdateAsync(Guid id, TopicUpdateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<RemoveTopicResponse>> TopicDeleteAsync(Guid id, CancellationToken cancellationToken = default);

    // Broadcasts
    Task<MillionSendResponse<BroadcastId>> BroadcastAddAsync(BroadcastCreateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<Broadcast>> BroadcastRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ListResponse<BroadcastListItem>>> BroadcastListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<BroadcastId>> BroadcastUpdateAsync(Guid id, BroadcastUpdateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<RemoveBroadcastResponse>> BroadcastDeleteAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<BroadcastId>> BroadcastSendAsync(Guid id, string? scheduledAt = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<CancelBroadcastResponse>> BroadcastCancelAsync(Guid id, CancellationToken cancellationToken = default);

    // Segments (MillionSend extension: saved filters over the team's contacts)
    Task<MillionSendResponse<Segment>> SegmentAddAsync(SegmentCreateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<Segment>> SegmentRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ListResponse<Segment>>> SegmentListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<Segment>> SegmentUpdateAsync(Guid id, SegmentUpdateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<RemoveSegmentResponse>> SegmentDeleteAsync(Guid id, CancellationToken cancellationToken = default);
    /// <param name="options">Pass a <see cref="ContactListOptions"/> to attach properties and/or topics to every row.</param>
    Task<MillionSendResponse<ListResponse<ContactListItem>>> SegmentContactListAsync(Guid id, ListOptions? options = null, CancellationToken cancellationToken = default);

    // Suppressions
    Task<MillionSendResponse<ObjectId>> SuppressionAddAsync(string email, SuppressionOrigin? origin = null, CancellationToken cancellationToken = default);
    /// <param name="options">Pass a <see cref="SuppressionListOptions"/> to filter by origin.</param>
    Task<MillionSendResponse<ListResponse<Suppression>>> SuppressionListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<Suppression>> SuppressionRetrieveAsync(string idOrEmail, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DeletedResponse>> SuppressionRemoveAsync(string idOrEmail, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DataResponse<ObjectId>>> SuppressionBatchAddAsync(IEnumerable<string> emails, SuppressionOrigin? origin = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DataResponse<DeletedResponse>>> SuppressionBatchRemoveAsync(IEnumerable<string> emails, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DataResponse<DeletedResponse>>> SuppressionBatchRemoveAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken = default);

    // Domains
    Task<MillionSendResponse<Domain>> DomainAddAsync(DomainCreateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ListResponse<Domain>>> DomainListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<Domain>> DomainRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<Domain>> DomainVerifyAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<Domain>> DomainUpdateAsync(Guid id, DomainUpdateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DeletedResponse>> DomainDeleteAsync(Guid id, CancellationToken cancellationToken = default);

    // Webhooks
    Task<MillionSendResponse<WebhookCreateResponse>> WebhookCreateAsync(WebhookCreateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ListResponse<Webhook>>> WebhookListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<Webhook>> WebhookRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ObjectId>> WebhookUpdateAsync(Guid id, WebhookUpdateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DeletedResponse>> WebhookDeleteAsync(Guid id, CancellationToken cancellationToken = default);
    /// <summary>Rotate the signing secret (POST /webhooks/{id}/rotate); the previous one keeps signing for the overlap window.</summary>
    Task<MillionSendResponse<WebhookRotateResponse>> WebhookRotateAsync(Guid id, WebhookRotateOptions? options = null, CancellationToken cancellationToken = default);

    // API keys
    Task<MillionSendResponse<ApiKeyCreateResponse>> ApiKeyCreateAsync(string name, ApiKeyPermission? permission = null, Guid? domainId = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ListResponse<ApiKey>>> ApiKeyListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DeletedResponse>> ApiKeyDeleteAsync(Guid id, CancellationToken cancellationToken = default);

    // Templates (addressed by id or alias)
    Task<MillionSendResponse<ObjectId>> TemplateCreateAsync(TemplateCreateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ListResponse<Template>>> TemplateListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<Template>> TemplateRetrieveAsync(string idOrAlias, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ObjectId>> TemplateUpdateAsync(string idOrAlias, TemplateUpdateOptions options, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<DeletedResponse>> TemplateDeleteAsync(string idOrAlias, CancellationToken cancellationToken = default);
    /// <summary>No-op kept for resend-dotnet compatibility: MillionSend templates have no draft state.</summary>
    Task<MillionSendResponse<ObjectId>> TemplatePublishAsync(string idOrAlias, CancellationToken cancellationToken = default);
    Task<MillionSendResponse<ObjectId>> TemplateDuplicateAsync(string idOrAlias, CancellationToken cancellationToken = default);

    // Usage (MillionSend extension: plan limits and today's consumption)
    Task<MillionSendResponse<Usage>> UsageRetrieveAsync(CancellationToken cancellationToken = default);

    // Deliverability (account-level score over the trailing window)
    Task<MillionSendResponse<Deliverability>> DeliverabilityRetrieveAsync(CancellationToken cancellationToken = default);
}
