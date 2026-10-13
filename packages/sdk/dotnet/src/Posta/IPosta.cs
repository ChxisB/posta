using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Posta;

/// <summary>
/// The Posta API surface. Every method returns a
/// <see cref="PostaResponse{T}"/> and never throws for an API or transport
/// error. Method names follow resend-dotnet; segments, usage, insights and
/// deliverability are Posta extensions.
/// </summary>
public interface IPosta
{
    // Emails
    Task<PostaResponse<CreateEmailResponse>> EmailSendAsync(EmailMessage message, string? idempotencyKey = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<CreateEmailResponse>> EmailSendAsync(string idempotencyKey, EmailMessage message, CancellationToken cancellationToken = default);
    Task<PostaResponse<Email>> EmailRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PostaResponse<ListResponse<Email>>> EmailListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    /// <summary>Reschedule a scheduled email (PATCH /emails/{id}).</summary>
    Task<PostaResponse<ObjectId>> EmailRescheduleAsync(Guid id, string scheduledAt, CancellationToken cancellationToken = default);
    Task<PostaResponse<DeletedResponse>> EmailDeleteAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PostaResponse<EmailInsights>> EmailInsightsRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PostaResponse<CancelEmailResponse>> EmailCancelAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PostaResponse<DataResponse<CreateEmailResponse>>> EmailBatchAsync(IEnumerable<EmailMessage> messages, string? idempotencyKey = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<DataResponse<CreateEmailResponse>>> EmailBatchAsync(string idempotencyKey, IEnumerable<EmailMessage> messages, CancellationToken cancellationToken = default);
    Task<PostaResponse<DataResponse<CreateEmailResponse>>> EmailBatchAsync(IEnumerable<EmailMessage> messages, BatchValidationMode validation, string? idempotencyKey = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<DataResponse<CreateEmailResponse>>> EmailBatchAsync(string idempotencyKey, IEnumerable<EmailMessage> messages, BatchValidationMode validation, CancellationToken cancellationToken = default);

    // Contacts (team-global)
    Task<PostaResponse<ContactId>> ContactAddAsync(ContactCreateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<ContactBatchResponse>> ContactBatchAsync(IEnumerable<ContactCreateOptions> contacts, ContactBatchOptions? options = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<Contact>> ContactRetrieveAsync(ContactAddress address, CancellationToken cancellationToken = default);
    Task<PostaResponse<ContactId>> ContactUpdateAsync(ContactUpdateOptions options, CancellationToken cancellationToken = default);
    /// <summary>Delete a contact; its emails stay in the send log unless <see cref="ContactDeleteOptions.Erase"/> is set.</summary>
    Task<PostaResponse<RemoveContactResponse>> ContactDeleteAsync(ContactAddress address, ContactDeleteOptions? options = null, CancellationToken cancellationToken = default);
    /// <summary>Delete up to 1000 contacts by email (POST /contacts/batch/remove); lists only the rows actually deleted.</summary>
    Task<PostaResponse<DataResponse<RemoveContactResponse>>> ContactBatchRemoveAsync(IEnumerable<string> emails, ContactDeleteOptions? options = null, CancellationToken cancellationToken = default);
    /// <summary>Delete up to 1000 contacts by id (POST /contacts/batch/remove); lists only the rows actually deleted.</summary>
    Task<PostaResponse<DataResponse<RemoveContactResponse>>> ContactBatchRemoveAsync(IEnumerable<Guid> ids, ContactDeleteOptions? options = null, CancellationToken cancellationToken = default);
    /// <summary>Read up to 1000 contacts by id or email in one request (POST /contacts/batch/get), in request order; entries that match no contact come back under <c>Missing</c>.</summary>
    Task<PostaResponse<ContactBatchGetResponse>> ContactBatchGetAsync(IEnumerable<ContactAddress> addresses, ContactBatchGetOptions? options = null, CancellationToken cancellationToken = default);
    /// <param name="options">Pass a <see cref="ContactListOptions"/> to attach properties and/or topics to every row.</param>
    Task<PostaResponse<ListResponse<ContactListItem>>> ContactListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<ContactId>> ContactTopicsUpdateAsync(ContactTopicsUpdateOptions options, CancellationToken cancellationToken = default);
    /// <summary>Every topic with the contact's effective subscription (GET /contacts/{id}/topics).</summary>
    Task<PostaResponse<ListResponse<ContactTopic>>> ContactListTopicsAsync(ContactAddress address, CancellationToken cancellationToken = default);
    /// <summary>Mint the contact's hosted preference-page URL (POST /contacts/{id}/preferences-link). 422 when the instance cannot build hosted links.</summary>
    Task<PostaResponse<ContactPreferencesLink>> ContactPreferencesLinkAsync(ContactAddress address, CancellationToken cancellationToken = default);
    Task<PostaResponse<ObjectId>> ContactAddToSegmentAsync(ContactAddress address, Guid segmentId, CancellationToken cancellationToken = default);
    Task<PostaResponse<DeletedResponse>> ContactRemoveFromSegmentAsync(ContactAddress address, Guid segmentId, CancellationToken cancellationToken = default);

    // Contact properties
    Task<PostaResponse<ContactProperty>> ContactPropCreateAsync(ContactPropertyCreateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<ListResponse<ContactProperty>>> ContactPropListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<ContactProperty>> ContactPropRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PostaResponse<ObjectId>> ContactPropUpdateAsync(Guid id, ContactPropertyUpdateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<DeletedResponse>> ContactPropDeleteAsync(Guid id, CancellationToken cancellationToken = default);

    // Topics
    Task<PostaResponse<TopicId>> TopicAddAsync(TopicCreateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<Topic>> TopicRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PostaResponse<DataResponse<Topic>>> TopicListAsync(CancellationToken cancellationToken = default);
    Task<PostaResponse<TopicId>> TopicUpdateAsync(Guid id, TopicUpdateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<RemoveTopicResponse>> TopicDeleteAsync(Guid id, CancellationToken cancellationToken = default);

    // Broadcasts
    Task<PostaResponse<BroadcastId>> BroadcastAddAsync(BroadcastCreateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<Broadcast>> BroadcastRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PostaResponse<ListResponse<BroadcastListItem>>> BroadcastListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<BroadcastId>> BroadcastUpdateAsync(Guid id, BroadcastUpdateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<RemoveBroadcastResponse>> BroadcastDeleteAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PostaResponse<BroadcastId>> BroadcastSendAsync(Guid id, string? scheduledAt = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<CancelBroadcastResponse>> BroadcastCancelAsync(Guid id, CancellationToken cancellationToken = default);

    // Segments (Posta extension: saved filters over the team's contacts)
    Task<PostaResponse<Segment>> SegmentAddAsync(SegmentCreateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<Segment>> SegmentRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PostaResponse<ListResponse<Segment>>> SegmentListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<Segment>> SegmentUpdateAsync(Guid id, SegmentUpdateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<RemoveSegmentResponse>> SegmentDeleteAsync(Guid id, CancellationToken cancellationToken = default);
    /// <param name="options">Pass a <see cref="ContactListOptions"/> to attach properties and/or topics to every row.</param>
    Task<PostaResponse<ListResponse<ContactListItem>>> SegmentContactListAsync(Guid id, ListOptions? options = null, CancellationToken cancellationToken = default);

    // Suppressions
    Task<PostaResponse<ObjectId>> SuppressionAddAsync(string email, SuppressionOrigin? origin = null, CancellationToken cancellationToken = default);
    /// <param name="options">Pass a <see cref="SuppressionListOptions"/> to filter by origin.</param>
    Task<PostaResponse<ListResponse<Suppression>>> SuppressionListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<Suppression>> SuppressionRetrieveAsync(string idOrEmail, CancellationToken cancellationToken = default);
    Task<PostaResponse<DeletedResponse>> SuppressionRemoveAsync(string idOrEmail, CancellationToken cancellationToken = default);
    Task<PostaResponse<DataResponse<ObjectId>>> SuppressionBatchAddAsync(IEnumerable<string> emails, SuppressionOrigin? origin = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<DataResponse<DeletedResponse>>> SuppressionBatchRemoveAsync(IEnumerable<string> emails, CancellationToken cancellationToken = default);
    Task<PostaResponse<DataResponse<DeletedResponse>>> SuppressionBatchRemoveAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken = default);

    // Domains
    Task<PostaResponse<Domain>> DomainAddAsync(DomainCreateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<ListResponse<Domain>>> DomainListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<Domain>> DomainRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PostaResponse<Domain>> DomainVerifyAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PostaResponse<Domain>> DomainUpdateAsync(Guid id, DomainUpdateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<DeletedResponse>> DomainDeleteAsync(Guid id, CancellationToken cancellationToken = default);

    // Webhooks
    Task<PostaResponse<WebhookCreateResponse>> WebhookCreateAsync(WebhookCreateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<ListResponse<Webhook>>> WebhookListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<Webhook>> WebhookRetrieveAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PostaResponse<ObjectId>> WebhookUpdateAsync(Guid id, WebhookUpdateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<DeletedResponse>> WebhookDeleteAsync(Guid id, CancellationToken cancellationToken = default);
    /// <summary>Rotate the signing secret (POST /webhooks/{id}/rotate); the previous one keeps signing for the overlap window.</summary>
    Task<PostaResponse<WebhookRotateResponse>> WebhookRotateAsync(Guid id, WebhookRotateOptions? options = null, CancellationToken cancellationToken = default);

    // API keys
    Task<PostaResponse<ApiKeyCreateResponse>> ApiKeyCreateAsync(string name, ApiKeyPermission? permission = null, Guid? domainId = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<ListResponse<ApiKey>>> ApiKeyListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<DeletedResponse>> ApiKeyDeleteAsync(Guid id, CancellationToken cancellationToken = default);

    // Templates (addressed by id or alias)
    Task<PostaResponse<ObjectId>> TemplateCreateAsync(TemplateCreateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<ListResponse<Template>>> TemplateListAsync(ListOptions? options = null, CancellationToken cancellationToken = default);
    Task<PostaResponse<Template>> TemplateRetrieveAsync(string idOrAlias, CancellationToken cancellationToken = default);
    Task<PostaResponse<ObjectId>> TemplateUpdateAsync(string idOrAlias, TemplateUpdateOptions options, CancellationToken cancellationToken = default);
    Task<PostaResponse<DeletedResponse>> TemplateDeleteAsync(string idOrAlias, CancellationToken cancellationToken = default);
    /// <summary>No-op kept for resend-dotnet compatibility: Posta templates have no draft state.</summary>
    Task<PostaResponse<ObjectId>> TemplatePublishAsync(string idOrAlias, CancellationToken cancellationToken = default);
    Task<PostaResponse<ObjectId>> TemplateDuplicateAsync(string idOrAlias, CancellationToken cancellationToken = default);

    // Usage (Posta extension: plan limits and today's consumption)
    Task<PostaResponse<Usage>> UsageRetrieveAsync(CancellationToken cancellationToken = default);

    // Deliverability (account-level score over the trailing window)
    Task<PostaResponse<Deliverability>> DeliverabilityRetrieveAsync(CancellationToken cancellationToken = default);
}
