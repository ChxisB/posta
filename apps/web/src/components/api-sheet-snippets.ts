/* Per-SDK snippets for the resource API sheets. Each snippet mirrors the real
   published SDK surface in packages/sdk/<lang>, only the resources every
   SDK implements (contacts, segments, topics, broadcasts, webhooks) get an entry here;
   the rest stay curl-only in api-sheet.tsx. Client setup follows the emails
   sheet's convention: placeholder key in the first section, reused after. */

export const LANGS = [
  "node",
  "python",
  "php",
  "ruby",
  "go",
  "rust",
  "java",
  "dotnet",
  "elixir",
] as const;
export type Lang = (typeof LANGS)[number];

type ResourceSnippets<Section extends string> = Record<Lang, Record<Section, string>>;

const ID = "4ef9a417-02e9-4d39-ad75-9611e0fcc33c";

export const CONTACTS_SNIPPETS: ResourceSnippets<"list" | "create" | "update"> = {
  node: {
    list: `import { Posta } from "@tack-labs/posta";

const ms = new Posta("po_xxxxxxxxx");

const { data, error } = await ms.contacts.list({ limit: 20 });`,
    create: `await ms.contacts.create({
  email: "success+ana@simulator.amazonses.com",
  firstName: "Ana",
  lastName: "Souza",
});`,
    update: `await ms.contacts.update({
  id: "${ID}",
  unsubscribed: true,
});`,
  },
  python: {
    list: `import posta

posta.api_key = "po_xxxxxxxxx"

contacts = posta.Contacts.list(limit=20)`,
    create: `posta.Contacts.create({
    "email": "success+ana@simulator.amazonses.com",
    "first_name": "Ana",
    "last_name": "Souza",
})`,
    update: `posta.Contacts.update({
    "id": "${ID}",
    "unsubscribed": True,
})`,
  },
  php: {
    list: `$ms = Posta\\Posta::client('po_xxxxxxxxx');

$contacts = $ms->contacts->list(['limit' => 20]);`,
    create: `$ms->contacts->create([
    'email' => 'success+ana@simulator.amazonses.com',
    'firstName' => 'Ana',
    'lastName' => 'Souza',
]);`,
    update: `$ms->contacts->update([
    'id' => '${ID}',
    'unsubscribed' => true,
]);`,
  },
  ruby: {
    list: `Posta.api_key = "po_xxxxxxxxx"

contacts = Posta::Contacts.list(limit: 20)`,
    create: `Posta::Contacts.create(
  email: "success+ana@simulator.amazonses.com",
  first_name: "Ana",
  last_name: "Souza"
)`,
    update: `Posta::Contacts.update(
  id: "${ID}",
  unsubscribed: true
)`,
  },
  go: {
    list: `client := posta.NewClient("po_xxxxxxxxx")

contacts, err := client.Contacts.List(&posta.ListOptions{Limit: 20})`,
    create: `contact, err := client.Contacts.Create(&posta.CreateContactRequest{
    Email:     "success+ana@simulator.amazonses.com",
    FirstName: "Ana",
    LastName:  "Souza",
})`,
    update: `unsubscribed := true

updated, err := client.Contacts.Update(&posta.UpdateContactRequest{
    Id:           "${ID}",
    Unsubscribed: &unsubscribed,
})`,
  },
  rust: {
    list: `let ms = Posta::new("po_xxxxxxxxx");

let contacts = ms
    .contacts
    .list(Some(&ListOptions {
        limit: Some(20),
        ..Default::default()
    }))
    .await?;`,
    create: `let mut contact = CreateContactOptions::new("success+ana@simulator.amazonses.com");
contact.first_name = Some("Ana".into());
contact.last_name = Some("Souza".into());

ms.contacts.create(&contact).await?;`,
    update: `ms.contacts
    .update(
        "${ID}",
        &UpdateContactOptions {
            unsubscribed: Some(true),
            ..Default::default()
        },
    )
    .await?;`,
  },
  java: {
    list: `Posta ms = new Posta("po_xxxxxxxxx");

ListResponse<Contact> contacts = ms.contacts().list(
    ListOptions.builder().limit(20).build()
);`,
    create: `ms.contacts().create(CreateContactOptions.builder()
    .email("success+ana@simulator.amazonses.com")
    .firstName("Ana")
    .lastName("Souza")
    .build());`,
    update: `ms.contacts().update(UpdateContactOptions.builder()
    .id("${ID}")
    .unsubscribed(true)
    .build());`,
  },
  dotnet: {
    list: `var ms = new PostaClient("po_xxxxxxxxx");

var contacts = await ms.ContactListAsync(new ListOptions { Limit = 20 });`,
    create: `await ms.ContactAddAsync(new ContactCreateOptions
{
    Email = "success+ana@simulator.amazonses.com",
    FirstName = "Ana",
    LastName = "Souza",
});`,
    update: `await ms.ContactUpdateAsync(new ContactUpdateOptions
{
    Id = Guid.Parse("${ID}"),
    Unsubscribed = true,
});`,
  },
  elixir: {
    list: `client = Posta.client(api_key: "po_xxxxxxxxx")

{:ok, contacts} = Posta.Contacts.list(client, limit: 20)`,
    create: `Posta.Contacts.create(client, %{
  email: "success+ana@simulator.amazonses.com",
  first_name: "Ana",
  last_name: "Souza"
})`,
    update: `Posta.Contacts.update(client, %{
  id: "${ID}",
  unsubscribed: true
})`,
  },
};

export const SEGMENTS_SNIPPETS: ResourceSnippets<"list" | "create" | "update"> = {
  node: {
    list: `import { Posta } from "@tack-labs/posta";

const ms = new Posta("po_xxxxxxxxx");

const { data, error } = await ms.segments.list({ limit: 20 });`,
    create: `await ms.segments.create({
  name: "Gmail users",
  filter: {
    match: "all",
    conditions: [{ field: "email", op: "ends_with", value: "@gmail.com" }],
  },
});`,
    update: `await ms.segments.update("${ID}", {
  name: "Gmail power users",
});`,
  },
  python: {
    list: `import posta

posta.api_key = "po_xxxxxxxxx"

segments = posta.Segments.list(limit=20)`,
    create: `posta.Segments.create({
    "name": "Gmail users",
    "filter": {
        "match": "all",
        "conditions": [
            {"field": "email", "op": "ends_with", "value": "@gmail.com"}
        ],
    },
})`,
    update: `posta.Segments.update(
    "${ID}",
    {"name": "Gmail power users"},
)`,
  },
  php: {
    list: `$ms = Posta\\Posta::client('po_xxxxxxxxx');

$segments = $ms->segments->list(['limit' => 20]);`,
    create: `$ms->segments->create([
    'name' => 'Gmail users',
    'filter' => [
        'match' => 'all',
        'conditions' => [
            ['field' => 'email', 'op' => 'ends_with', 'value' => '@gmail.com'],
        ],
    ],
]);`,
    update: `$ms->segments->update('${ID}', [
    'name' => 'Gmail power users',
]);`,
  },
  ruby: {
    list: `Posta.api_key = "po_xxxxxxxxx"

segments = Posta::Segments.list(limit: 20)`,
    create: `Posta::Segments.create(
  name: "Gmail users",
  filter: {
    match: "all",
    conditions: [
      { field: "email", op: "ends_with", value: "@gmail.com" }
    ]
  }
)`,
    update: `Posta::Segments.update(
  "${ID}",
  name: "Gmail power users"
)`,
  },
  go: {
    list: `client := posta.NewClient("po_xxxxxxxxx")

segments, err := client.Segments.List(&posta.ListOptions{Limit: 20})`,
    create: `segment, err := client.Segments.Create(&posta.CreateSegmentRequest{
    Name: "Gmail users",
    Filter: posta.SegmentFilter{
        Match: "all",
        Conditions: []posta.SegmentCondition{
            {Field: "email", Op: "ends_with", Value: "@gmail.com"},
        },
    },
})`,
    update: `segment, err := client.Segments.Update(
    "${ID}",
    &posta.UpdateSegmentRequest{Name: "Gmail power users"},
)`,
  },
  rust: {
    list: `let ms = Posta::new("po_xxxxxxxxx");

let segments = ms
    .segments
    .list(Some(&ListOptions {
        limit: Some(20),
        ..Default::default()
    }))
    .await?;`,
    create: `let segment = CreateSegmentOptions {
    name: "Gmail users".into(),
    filter: SegmentFilter {
        match_: SegmentMatch::All,
        conditions: vec![SegmentCondition {
            field: "email".into(),
            op: "ends_with".into(),
            value: Some("@gmail.com".into()),
        }],
    },
};

ms.segments.create(&segment).await?;`,
    update: `ms.segments
    .update(
        "${ID}",
        &UpdateSegmentOptions {
            name: Some("Gmail power users".into()),
            ..Default::default()
        },
    )
    .await?;`,
  },
  java: {
    list: `Posta ms = new Posta("po_xxxxxxxxx");

ListResponse<Segment> segments = ms.segments().list(
    ListOptions.builder().limit(20).build()
);`,
    create: `ms.segments().create(CreateSegmentOptions.builder()
    .name("Gmail users")
    .filter(SegmentFilter.builder()
        .match("all")
        .condition(new SegmentCondition("email", "ends_with", "@gmail.com"))
        .build())
    .build());`,
    update: `ms.segments().update(
    "${ID}",
    UpdateSegmentOptions.builder().name("Gmail power users").build()
);`,
  },
  dotnet: {
    list: `var ms = new PostaClient("po_xxxxxxxxx");

var segments = await ms.SegmentListAsync(new ListOptions { Limit = 20 });`,
    create: `await ms.SegmentAddAsync(new SegmentCreateOptions
{
    Name = "Gmail users",
    Filter = new SegmentFilter
    {
        Match = SegmentMatch.All,
        Conditions = new List<SegmentCondition>
        {
            new() { Field = "email", Op = "ends_with", Value = "@gmail.com" },
        },
    },
});`,
    update: `await ms.SegmentUpdateAsync(
    Guid.Parse("${ID}"),
    new SegmentUpdateOptions { Name = "Gmail power users" }
);`,
  },
  elixir: {
    list: `client = Posta.client(api_key: "po_xxxxxxxxx")

{:ok, segments} = Posta.Segments.list(client, limit: 20)`,
    create: `Posta.Segments.create(client, %{
  name: "Gmail users",
  filter: %{
    match: :all,
    conditions: [
      %{field: "email", op: "ends_with", value: "@gmail.com"}
    ]
  }
})`,
    update: `Posta.Segments.update(client, "${ID}", %{
  name: "Gmail power users"
})`,
  },
};

export const TOPICS_SNIPPETS: ResourceSnippets<"list" | "create" | "get"> = {
  node: {
    list: `import { Posta } from "@tack-labs/posta";

const ms = new Posta("po_xxxxxxxxx");

const { data, error } = await ms.topics.list();`,
    create: `await ms.topics.create({
  name: "Product updates",
  description: "New features and improvements",
  defaultSubscription: "opt_in",
});`,
    get: `const { data, error } = await ms.topics.get(
  "${ID}",
);`,
  },
  python: {
    list: `import posta

posta.api_key = "po_xxxxxxxxx"

topics = posta.Topics.list()`,
    create: `posta.Topics.create({
    "name": "Product updates",
    "description": "New features and improvements",
    "default_subscription": "opt_in",
})`,
    get: `topic = posta.Topics.get(
    "${ID}"
)`,
  },
  php: {
    list: `$ms = Posta\\Posta::client('po_xxxxxxxxx');

$topics = $ms->topics->list();`,
    create: `$ms->topics->create([
    'name' => 'Product updates',
    'description' => 'New features and improvements',
    'defaultSubscription' => 'opt_in',
]);`,
    get: `$topic = $ms->topics->get(
    '${ID}'
);`,
  },
  ruby: {
    list: `Posta.api_key = "po_xxxxxxxxx"

topics = Posta::Topics.list`,
    create: `Posta::Topics.create(
  name: "Product updates",
  description: "New features and improvements",
  default_subscription: "opt_in"
)`,
    get: `topic = Posta::Topics.get(
  "${ID}"
)`,
  },
  go: {
    list: `client := posta.NewClient("po_xxxxxxxxx")

topics, err := client.Topics.List()`,
    create: `topic, err := client.Topics.Create(&posta.CreateTopicRequest{
    Name:                "Product updates",
    Description:         "New features and improvements",
    DefaultSubscription: "opt_in",
})`,
    get: `topic, err := client.Topics.Get(
    "${ID}",
)`,
  },
  rust: {
    list: `let ms = Posta::new("po_xxxxxxxxx");

let topics = ms.topics.list().await?;`,
    create: `let mut topic = CreateTopicOptions::new(
    "Product updates",
    TopicSubscription::OptIn,
);
topic.description = Some("New features and improvements".into());

ms.topics.create(&topic).await?;`,
    get: `let topic = ms
    .topics
    .get("${ID}")
    .await?;`,
  },
  java: {
    list: `Posta ms = new Posta("po_xxxxxxxxx");

DataResponse<Topic> topics = ms.topics().list();`,
    create: `ms.topics().create(CreateTopicOptions.builder()
    .name("Product updates")
    .description("New features and improvements")
    .defaultSubscription(Subscription.OPT_IN)
    .build());`,
    get: `Topic topic = ms.topics().get(
    "${ID}"
);`,
  },
  dotnet: {
    list: `var ms = new PostaClient("po_xxxxxxxxx");

var topics = await ms.TopicListAsync();`,
    create: `await ms.TopicAddAsync(new TopicCreateOptions
{
    Name = "Product updates",
    Description = "New features and improvements",
    DefaultSubscription = TopicSubscription.OptIn,
});`,
    get: `var topic = await ms.TopicRetrieveAsync(
    Guid.Parse("${ID}")
);`,
  },
  elixir: {
    list: `client = Posta.client(api_key: "po_xxxxxxxxx")

{:ok, topics} = Posta.Topics.list(client)`,
    create: `Posta.Topics.create(client, %{
  name: "Product updates",
  description: "New features and improvements",
  default_subscription: :opt_in
})`,
    get: `{:ok, topic} = Posta.Topics.get(
  client,
  "${ID}"
)`,
  },
};

export const BROADCASTS_SNIPPETS: ResourceSnippets<"list" | "create" | "send"> = {
  node: {
    list: `import { Posta } from "@tack-labs/posta";

const ms = new Posta("po_xxxxxxxxx");

const { data, error } = await ms.broadcasts.list({ limit: 20 });`,
    create: `await ms.broadcasts.create({
  name: "Launch announcement",
  segmentId: "${ID}",
  from: "Acme <news@yourdomain.com>",
  subject: "We just launched",
  html: "<p>Big news!</p>",
});`,
    send: `await ms.broadcasts.send("${ID}", {
  scheduledAt: "in 1 hour",
});`,
  },
  python: {
    list: `import posta

posta.api_key = "po_xxxxxxxxx"

broadcasts = posta.Broadcasts.list(limit=20)`,
    create: `posta.Broadcasts.create({
    "name": "Launch announcement",
    "segment_id": "${ID}",
    "from": "Acme <news@yourdomain.com>",
    "subject": "We just launched",
    "html": "<p>Big news!</p>",
})`,
    send: `posta.Broadcasts.send(
    "${ID}",
    scheduled_at="in 1 hour",
)`,
  },
  php: {
    list: `$ms = Posta\\Posta::client('po_xxxxxxxxx');

$broadcasts = $ms->broadcasts->list(['limit' => 20]);`,
    create: `$ms->broadcasts->create([
    'name' => 'Launch announcement',
    'segmentId' => '${ID}',
    'from' => 'Acme <news@yourdomain.com>',
    'subject' => 'We just launched',
    'html' => '<p>Big news!</p>',
]);`,
    send: `$ms->broadcasts->send('${ID}', [
    'scheduledAt' => 'in 1 hour',
]);`,
  },
  ruby: {
    list: `Posta.api_key = "po_xxxxxxxxx"

broadcasts = Posta::Broadcasts.list(limit: 20)`,
    create: `Posta::Broadcasts.create(
  name: "Launch announcement",
  segment_id: "${ID}",
  from: "Acme <news@yourdomain.com>",
  subject: "We just launched",
  html: "<p>Big news!</p>"
)`,
    send: `Posta::Broadcasts.send(
  "${ID}",
  scheduled_at: "in 1 hour"
)`,
  },
  go: {
    list: `client := posta.NewClient("po_xxxxxxxxx")

broadcasts, err := client.Broadcasts.List(&posta.ListOptions{Limit: 20})`,
    create: `broadcast, err := client.Broadcasts.Create(&posta.CreateBroadcastRequest{
    Name:      "Launch announcement",
    SegmentId: "${ID}",
    From:      "Acme <news@yourdomain.com>",
    Subject:   "We just launched",
    Html:      "<p>Big news!</p>",
})`,
    send: `sent, err := client.Broadcasts.Send(
    "${ID}",
    &posta.SendBroadcastRequest{ScheduledAt: "in 1 hour"},
)`,
  },
  rust: {
    list: `let ms = Posta::new("po_xxxxxxxxx");

let broadcasts = ms
    .broadcasts
    .list(Some(&ListOptions {
        limit: Some(20),
        ..Default::default()
    }))
    .await?;`,
    create: `let mut broadcast = CreateBroadcastOptions::new(
    "Acme <news@yourdomain.com>",
    "We just launched",
);
broadcast.name = Some("Launch announcement".into());
broadcast.segment_id = Some("${ID}".into());
broadcast.html = Some("<p>Big news!</p>".into());

ms.broadcasts.create(&broadcast).await?;`,
    send: `ms.broadcasts
    .send("${ID}", Some("in 1 hour"))
    .await?;`,
  },
  java: {
    list: `Posta ms = new Posta("po_xxxxxxxxx");

ListResponse<Broadcast> broadcasts = ms.broadcasts().list(
    ListOptions.builder().limit(20).build()
);`,
    create: `ms.broadcasts().create(CreateBroadcastOptions.builder()
    .name("Launch announcement")
    .segmentId("${ID}")
    .from("Acme <news@yourdomain.com>")
    .subject("We just launched")
    .html("<p>Big news!</p>")
    .build());`,
    send: `ms.broadcasts().send(
    "${ID}",
    SendBroadcastOptions.builder().scheduledAt("in 1 hour").build()
);`,
  },
  dotnet: {
    list: `var ms = new PostaClient("po_xxxxxxxxx");

var broadcasts = await ms.BroadcastListAsync(new ListOptions { Limit = 20 });`,
    create: `await ms.BroadcastAddAsync(new BroadcastCreateOptions
{
    Name = "Launch announcement",
    SegmentId = Guid.Parse("${ID}"),
    From = "Acme <news@yourdomain.com>",
    Subject = "We just launched",
    Html = "<p>Big news!</p>",
});`,
    send: `await ms.BroadcastSendAsync(
    Guid.Parse("${ID}"),
    scheduledAt: "in 1 hour"
);`,
  },
  elixir: {
    list: `client = Posta.client(api_key: "po_xxxxxxxxx")

{:ok, broadcasts} = Posta.Broadcasts.list(client, limit: 20)`,
    create: `Posta.Broadcasts.create(client, %{
  name: "Launch announcement",
  segment_id: "${ID}",
  from: "Acme <news@yourdomain.com>",
  subject: "We just launched",
  html: "<p>Big news!</p>"
})`,
    send: `Posta.Broadcasts.send(
  client,
  "${ID}",
  scheduled_at: "in 1 hour"
)`,
  },
};

export const WEBHOOKS_SNIPPETS: ResourceSnippets<"list" | "create" | "update"> = {
  node: {
    list: `import { Posta } from "@tack-labs/posta";

const ms = new Posta("po_xxxxxxxxx");

const { data, error } = await ms.webhooks.list({ limit: 20 });`,
    create: `await ms.webhooks.create({
  endpoint: "https://example.com/webhooks/posta",
  events: ["email.delivered", "email.bounced"],
});`,
    update: `await ms.webhooks.update("${ID}", {
  status: "disabled",
});`,
  },
  python: {
    list: `import posta

posta.api_key = "po_xxxxxxxxx"

webhooks = posta.Webhooks.list(limit=20)`,
    create: `posta.Webhooks.create({
    "endpoint": "https://example.com/webhooks/posta",
    "events": ["email.delivered", "email.bounced"],
})`,
    update: `posta.Webhooks.update({
    "webhook_id": "${ID}",
    "status": "disabled",
})`,
  },
  php: {
    list: `$ms = Posta\\Posta::client('po_xxxxxxxxx');

$webhooks = $ms->webhooks->list(['limit' => 20]);`,
    create: `$ms->webhooks->create([
    'endpoint' => 'https://example.com/webhooks/posta',
    'events' => ['email.delivered', 'email.bounced'],
]);`,
    update: `$ms->webhooks->update('${ID}', [
    'status' => 'disabled',
]);`,
  },
  ruby: {
    list: `Posta.api_key = "po_xxxxxxxxx"

webhooks = Posta::Webhooks.list(limit: 20)`,
    create: `Posta::Webhooks.create(
  endpoint: "https://example.com/webhooks/posta",
  events: ["email.delivered", "email.bounced"]
)`,
    update: `Posta::Webhooks.update(
  "${ID}",
  status: "disabled"
)`,
  },
  go: {
    list: `client := posta.NewClient("po_xxxxxxxxx")

webhooks, err := client.Webhooks.List(&posta.ListOptions{Limit: 20})`,
    create: `webhook, err := client.Webhooks.Create(&posta.CreateWebhookRequest{
    Endpoint: "https://example.com/webhooks/posta",
    Events:   []string{"email.delivered", "email.bounced"},
})`,
    update: `updated, err := client.Webhooks.Update(
    "${ID}",
    &posta.UpdateWebhookRequest{Status: "disabled"},
)`,
  },
  rust: {
    list: `let ms = Posta::new("po_xxxxxxxxx");

let webhooks = ms
    .webhooks
    .list(Some(&ListOptions {
        limit: Some(20),
        ..Default::default()
    }))
    .await?;`,
    create: `ms.webhooks
    .create(&CreateWebhookOptions {
        endpoint: "https://example.com/webhooks/posta".into(),
        events: vec!["email.delivered".into(), "email.bounced".into()],
        signing_secret: None,
    })
    .await?;`,
    update: `ms.webhooks
    .update("${ID}", &UpdateWebhookOptions {
        status: Some(WebhookStatus::Disabled),
        ..Default::default()
    })
    .await?;`,
  },
  java: {
    list: `Posta ms = new Posta("po_xxxxxxxxx");

ListResponse<Webhook> webhooks = ms.webhooks().list(
    ListOptions.builder().limit(20).build()
);`,
    create: `ms.webhooks().create(CreateWebhookOptions.builder()
    .endpoint("https://example.com/webhooks/posta")
    .events(WebhookEvent.EMAIL_DELIVERED, WebhookEvent.EMAIL_BOUNCED)
    .build());`,
    update: `ms.webhooks().update(
    "${ID}",
    UpdateWebhookOptions.builder().status("disabled").build()
);`,
  },
  dotnet: {
    list: `var ms = new PostaClient("po_xxxxxxxxx");

var webhooks = await ms.WebhookListAsync(new ListOptions { Limit = 20 });`,
    create: `await ms.WebhookCreateAsync(new WebhookCreateOptions
{
    Endpoint = "https://example.com/webhooks/posta",
    Events = new List<string> { "email.delivered", "email.bounced" },
});`,
    update: `await ms.WebhookUpdateAsync(
    Guid.Parse("${ID}"),
    new WebhookUpdateOptions { Status = WebhookStatus.Disabled }
);`,
  },
  elixir: {
    list: `client = Posta.client(api_key: "po_xxxxxxxxx")

{:ok, webhooks} = Posta.Webhooks.list(client, limit: 20)`,
    create: `Posta.Webhooks.create(client, %{
  endpoint: "https://example.com/webhooks/posta",
  events: ["email.delivered", "email.bounced"]
})`,
    update: `Posta.Webhooks.update(client, "${ID}", %{status: "disabled"})`,
  },
};
