# AWS SES delivery and inbound mail

Posta uses the same AWS architecture as MillionSend: SESv2 raw sending, a configuration set and SNS topic in every sending region, and one SQS queue for events. One installation shares one AWS account. Each domain owner chooses a sending region in the add-domain form or setup wizard. The domain retains that region; adding another region does not move existing domains.

Incoming mail can be received two ways, chosen per domain:

- **By SES.** The domain's MX points to `inbound-smtp.<region>.amazonaws.com`. SES stores each message in an S3 bucket, tells Posta through the same SNS topic and SQS queue that carry delivery events, and a worker ingests it. From there it follows the same routes, spam handling and endpoints as any other incoming mail. This needs no public port 25. See [Receive mail through SES](#receive-mail-through-ses).
- **By Posta's SMTP server.** The domain's MX points at your own host (`POSTA_MX_RECORDS`) and port 25 is exposed. This is what a domain gets when its region has no inbound bucket configured, when `POSTA_INBOUND_PROVIDER=smtp`, and for every domain that existed before receiving was set up.

Either way only a domain's `bounce` subdomain points to SES's feedback endpoint, and sending and inbound ownership verification are stored separately.

## Provision the first region

Use AWS credentials with CloudFormation, SES, SNS and SQS provisioning permissions. These deployment permissions are separate from the application's runtime permissions.

```sh
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name posta-ses \
  --template-file infra/aws/posta-ses.json

aws cloudformation describe-stacks \
  --region us-east-1 --stack-name posta-ses \
  --query 'Stacks[0].Outputs'
```

The template creates an SES configuration set, an SNS event topic, the shared SQS queue and its subscription, plus the resources for [receiving mail through SES](#receive-mail-through-ses): an inbound bucket and a receipt rule set (pass `--parameter-overrides EnableInbound=false` to skip them, for example in a region that cannot receive). It does not create access keys, and it does not change your SES account settings or activate the receipt rule set. Configure runtime IAM using `infra/aws/runtime-policy.json`, replacing `ACCOUNT_ID` with your account ID; prefer an IAM role or provide environment credentials. The AWS SDK also supports temporary credentials through `AWS_SESSION_TOKEN`.

Set these values from the stack outputs:

```dotenv
POSTA_DELIVERY_PROVIDER=ses
AWS_REGION=us-east-1
AWS_REGIONS=us-east-1
SES_CONFIGURATION_SET=posta
SNS_TOPIC_ARNS=arn:aws:sns:us-east-1:123456789012:posta-events
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/posta-events
SES_MAX_SEND_RATE=14
SES_MAIL_FROM_SUBDOMAIN=bounce
POSTA_MX_RECORDS=mx.example.com
```

Restart the services. Add a domain, select its region, publish the exact record names, values and priorities shown on its DNS page, and click **Check DNS and verification**. Posta generates a 2048-bit BYODKIM key and uploads the private key to SES; only the public key is stored. Sending requires SES verification and the matching live DKIM, return-path MX and SPF records. Receiving ownership can verify as soon as DKIM verifies, independently of the sending return path. A send API call with an unverified sender returns `DomainNotVerified`; authenticated SMTP submission gets a temporary failure until setup is complete.

AWS grants production access separately in each region. Sandbox regions are labelled in the selector and may send only to verified recipients. Workers use the lower of `SES_MAX_SEND_RATE` and the region's actual send rate, with PostgreSQL coordinating multiple workers. Exhausting or disabling one region's quota defers only its messages.

For the MillionSend suppression policy, configure account-level suppression for hard bounces in each served region:

```sh
aws sesv2 put-account-suppression-attributes \
  --region us-east-1 --suppressed-reasons BOUNCE
```

Complaints are suppressed in the originating Posta server rather than blocking the address across all senders in the AWS account.

## Add another sending region

Get the first stack's `QueueArn`, then deploy the region template **in the new region**:

```sh
aws cloudformation deploy \
  --region eu-west-1 \
  --stack-name posta-ses \
  --template-file infra/aws/posta-ses-region.json \
  --parameter-overrides QueueArn=arn:aws:sqs:us-east-1:123456789012:posta-events
```

Use the same configuration set name and SNS topic name in every region. The first template's queue policy allows those same-account topics across regions. Append the new region and topic ARN, keeping `AWS_REGION` and `SQS_QUEUE_URL` unchanged:

```dotenv
AWS_REGION=us-east-1
AWS_REGIONS=us-east-1,eu-west-1
SNS_TOPIC_ARNS=arn:aws:sns:us-east-1:123456789012:posta-events,arn:aws:sns:eu-west-1:123456789012:posta-events
```

Restart the services. Domain owners can now choose either region. Existing domains and queued messages retain their original region. Request production access and configure suppression independently in the new region.

## Receive mail through SES

```
sender → inbound-smtp.<region>.amazonaws.com → SES receipt rule ─┬→ S3 object (the raw message)
                                                                 └→ SNS posta-events → SQS → worker → Posta routes
```

SES stores the raw message in S3 and, because the same rule action names the region's `posta-events` topic, announces it on the topic that already feeds Posta's queue. The worker reads the object, stores it in the owning server's database as an incoming message, and from then on it is handled like mail received over SMTP: the route's mode, spam quarantine, bounces and the HTTP or SMTP endpoint all apply.

### What the templates add

Both templates create these in their region unless you deploy with `EnableInbound=false`:

- a private S3 bucket, `posta-inbound-<account>-<region>`, encrypted, with public access blocked and TLS required, that only your SES receipt rule can write to (the bucket policy checks the account and the rule set). It is retained if you delete the stack.
- a lifecycle rule that expires objects after `InboundRetentionDays` (default 7). Posta deletes each message once it is stored, so this only clears mail that was never picked up.
- a receipt rule set, `posta-inbound`, and a rule with one S3 action that also publishes to the region's topic. Spam and virus scanning are on.

| Parameter | Default | Purpose |
|---|---|---|
| `EnableInbound` | `true` | Set to `false` in a region that cannot receive, or where you only send |
| `InboundBucketName` | `posta-inbound-<account>-<region>` | Use your own bucket name |
| `InboundPrefix` | `inbound/` | Must match `SES_INBOUND_PREFIX` |
| `InboundRetentionDays` | `7` | Expiry for mail Posta never ingested |
| `ReceiptRuleSetName` | `posta-inbound` | Rule set that holds the Posta rule |
| `CreateReceiptRuleSet` | `true` | Set to `false` to add the rule to a set that already exists |

Deploy or update each region's stack, then read the outputs:

```sh
aws cloudformation deploy --region eu-west-1 --stack-name posta-ses \
  --template-file infra/aws/posta-ses-region.json \
  --parameter-overrides QueueArn=arn:aws:sqs:us-east-1:123456789012:posta-events

aws cloudformation describe-stacks --region eu-west-1 --stack-name posta-ses --query 'Stacks[0].Outputs'
```

### Activate the rule set

CloudFormation cannot activate a receipt rule set, so do it once per region (the `ActivateRuleSetCommand` output prints this):

```sh
aws ses set-active-receipt-rule-set --region eu-west-1 --rule-set-name posta-inbound
```

**A region has exactly one active rule set, and activating another replaces it and stops its rules.** If the region already receives mail through SES, do not activate this one. Deploy with `CreateReceiptRuleSet=false` and `ReceiptRuleSetName` set to the active set instead, so the Posta rule is added to it. The Posta rule has no recipient condition, so it sees every address SES accepts in that region; Posta ignores addresses that do not belong to one of its domains.

### Where SES can receive

SES receives only in regions that have an inbound endpoint. At the time of writing these send but do not receive: ap-south-2, ap-southeast-5, ca-west-1, eu-central-2, me-central-1 and GovCloud (check [the AWS endpoint list](https://docs.aws.amazon.com/general/latest/gr/ses.html) before relying on this). A domain can still send from one of them: give it a different **receiving** region, and Posta creates its SES identity in both regions with the same DKIM key, so the one DKIM record verifies both. The bucket, topic and rule set must all be in the receiving region, which is why every region that receives has its own bucket.

### Configure Posta

```dotenv
POSTA_INBOUND_PROVIDER=ses
SES_INBOUND_BUCKETS=us-east-1=posta-inbound-123456789012-us-east-1,eu-west-1=posta-inbound-123456789012-eu-west-1
SES_INBOUND_PREFIX=inbound/
```

A region listed in `SES_INBOUND_BUCKETS` must also be in `AWS_REGIONS`, and its topic in `SNS_TOPIC_ARNS`: received mail arrives through the same topic allowlist as delivery events. The runtime policy grants `s3:GetObject` and `s3:DeleteObject` on `posta-inbound-ACCOUNT_ID-*/inbound/*`; widen it if you chose other bucket names or a different prefix. Restart the services.

Only a region with a bucket can be chosen as a receiving region. A domain whose sending region has none is received by Posta's SMTP server, exactly as before, and `POSTA_INBOUND_PROVIDER=smtp` does that for every domain connected afterwards.

### Connect a domain

Pick the receiving region in the add-domain form or setup wizard; it defaults to the sending region when that region has a bucket. A domain keeps both regions once connected. Its DNS page then shows an MX record for the apex, `inbound-smtp.<receiving-region>.amazonaws.com`, priority 10, in place of your `POSTA_MX_RECORDS` hosts. Publish it, remove other MX records for the domain, and click **Check DNS and verification**. SES only accepts mail for an identity that is verified in the receiving region, so receiving starts once DKIM shows OK in that region too.

Posta's SMTP server keeps accepting mail for a domain after it moves to SES, so you can switch the MX without a gap.

### What Posta does with each message

- One incoming message is created for each recipient that belongs to a verified, incoming Posta domain whose receiving region is this one. The route is chosen by local part, ignoring a `+tag`, falling back to the `*` catch-all. Recipients of other domains are ignored; one SES message for several servers' addresses is stored once per server.
- The raw message is kept byte for byte. SES refuses anything over 40 MB, and Posta rejects larger objects.
- SES's verdicts are kept. A spam **fail** adds a spam check (`SES_SPAM_VERDICT`) that scores one more than `default_spam_threshold`, so the route's spam mode quarantines or fails the message and the server's thresholds apply. A virus **fail** marks the message as a threat. Rspamd, SpamAssassin and ClamAV, when you run them, add to these.
- Once stored, the object is deleted from S3 on a best-effort basis; the lifecycle rule is the backstop.

### Reliability

An SQS message is deleted only after the notification is stored in PostgreSQL (`ses_event_inbox`, `kind = 'inbound'`). Ingestion is at least once and idempotent: each recipient's copy is recorded in a per-server `ses_inbound_receipts` table in the same transaction as the message, so a redelivered notification, two workers racing, or a crash between storing and queueing never produces a duplicate or loses the message. Transient failures (S3, the database) retry with a growing delay and stay visible in `ses_event_inbox.error`, `attempts` and `retry_after`. A failure that retrying cannot fix is dropped with its reason in `error`: the object is gone, or the notification names a bucket, prefix or region other than the configured one. Posta only reads the bucket and prefix it was configured with, so a forged notification cannot make it read another object.

## Delivery events

SQS works without a publicly reachable HTTP API and buffers events through restarts. Leave raw message delivery disabled on SNS subscriptions: Posta validates the SNS envelope and its topic allowlist before storing an event in PostgreSQL. It acknowledges SQS messages only after durable ingestion. Delivery, delay, bounce, complaint and rejection events update the message's history; hard bounces and complaints suppress the recipient in that server. SES handles retries after acceptance, so delivery-delay events never cause Posta to send a second copy. `Sent` at initial submission means SES accepted it; the subsequent delivery entry confirms recipient-server delivery.

An optional SNS HTTPS subscription may point to `https://your-api.example.com/ses/events`. Signature verification gates both notifications and automatic subscription confirmation. The SNS message ID deduplicates SQS and HTTPS ingestion, and per-server transactional receipts make event retries safe. Events correlate through the stored SES message ID and topic region; sender-provided tags cannot select another server's messages. Existing tracking stays in Posta; the templates do not enable SES Open or Click rewriting.

Pending event ingestion errors remain visible in `ses_event_inbox.error`, `attempts` and `retry_after`. A receipt may arrive after its event; the event retries until the receipt exists. Operator-selected topics should contain only Posta's configuration-set events.

## Existing installations and rollback

The database change only adds columns and tables. It preserves domains, legacy DKIM private keys, messages and inbound routes, and copies existing verified ownership into `inbound_verified_at`. Upgrade the services together, then open each existing domain's DNS page and choose **Connect to SES** in its intended region. Publish the new sending records and verify before enabling submissions from that domain. The sending check fails closed for domains that have not been connected; it does not affect their existing inbound routes. Connecting a domain also picks its receiving region (see [Connect a domain](#connect-a-domain)); if its sending region has an inbound bucket, its DNS page will ask for the SES MX record. Until you publish it, your existing MX keeps delivering to Posta's SMTP server, which stays enabled for the domain.

To roll back delivery, set `POSTA_DELIVERY_PROVIDER=smtp` and restart the services. Keep the added columns and event tables; no destructive schema rollback is needed. Retain or restore the legacy SPF/DKIM DNS records if using direct SMTP. Existing SES-accepted messages are not resubmitted after switching providers. Drain or stop the workers before switching delivery providers to avoid overlapping old/new sends. Removing a domain from Posta does not delete the identity from your AWS account; remove it there when it is no longer used.

SES sending and local receipt storage span two systems. Posta disables automatic SDK send retries and reuses recorded acceptance receipts. A process failure between AWS accepting a send and PostgreSQL storing its receipt can still cause a duplicate on retry; SES raw sending has no idempotency token.

AWS references: [SES raw sending](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html), [custom MAIL FROM records](https://docs.aws.amazon.com/ses/latest/dg/mail-from.html), [CloudFormation event destinations](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-ses-configurationseteventdestination-eventdestination.html), [SNS signature verification](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html), [receiving email with SES](https://docs.aws.amazon.com/ses/latest/dg/receiving-email.html), [the S3 receipt action](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-s3.html).
