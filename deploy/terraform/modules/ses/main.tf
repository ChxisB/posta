# Posta's SES wiring: the same resources as infra/posta-ses.cfn.yaml and the
# setup wizard, minus the IAM user and access key. The app runs under an IAM
# role (modules/posta binds it to the pods with EKS Pod Identity), so this
# module outputs a managed policy to attach to that role instead.

data "aws_caller_identity" "current" {}

locals {
  # Mirrors SES_EVENT_TYPES in packages/ses/src/setup-constants.ts (pinned by
  # packages/ses/test/iam-policy.test.ts): no open/click, which would make SES
  # rewrite links and inject its own pixel, and no send, which the worker
  # records itself.
  event_types = ["DELIVERY", "DELIVERY_DELAY", "BOUNCE", "COMPLAINT", "REJECT", "RENDERING_FAILURE"]

  # policy.json mirrors SES_IAM_POLICY in the same file, also pinned by the test.
  ses_policy = jsondecode(file("${path.module}/policy.json"))
}

resource "aws_sns_topic" "events" {
  name = "${var.name}-events"
  tags = var.tags
}

# SES cannot publish to the topic without this; the event destination is
# rejected at creation time if the topic policy is missing.
resource "aws_sns_topic_policy" "events" {
  arn = aws_sns_topic.events.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ses.amazonaws.com" }
      Action    = "sns:Publish"
      Resource  = aws_sns_topic.events.arn
      Condition = { StringEquals = { "AWS:SourceAccount" = data.aws_caller_identity.current.account_id } }
    }]
  })
}

# The transport every deployment gets: the worker long-polls it, so events
# buffer through restarts and no inbound reachability is needed.
resource "aws_sqs_queue" "events" {
  name                    = "${var.name}-events"
  sqs_managed_sse_enabled = true
  tags                    = var.tags
}

resource "aws_sqs_queue_policy" "events" {
  queue_url = aws_sqs_queue.events.url
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.events.arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.events.arn } }
    }]
  })
}

# Same-account SNS to SQS needs no confirmation handshake.
resource "aws_sns_topic_subscription" "queue" {
  topic_arn = aws_sns_topic.events.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.events.arn

  depends_on = [aws_sqs_queue_policy.events]
}

# Optional lower-latency push on top of the queue (the app dedupes the two on
# the SNS MessageId). Stays pending until the app confirms it, which it does by
# itself once it runs with SNS_TOPIC_ARNS set to this topic.
resource "aws_sns_topic_subscription" "https" {
  count     = var.app_base_url == "" ? 0 : 1
  topic_arn = aws_sns_topic.events.arn
  protocol  = "https"
  endpoint  = "${var.app_base_url}/ses/events"
}

resource "aws_sesv2_configuration_set" "this" {
  configuration_set_name = var.name
  tags                   = var.tags
}

resource "aws_sesv2_configuration_set_event_destination" "events" {
  configuration_set_name = aws_sesv2_configuration_set.this.configuration_set_name
  event_destination_name = "${var.name}-events"

  event_destination {
    enabled              = true
    matching_event_types = local.event_types

    sns_destination {
      topic_arn = aws_sns_topic.events.arn
    }
  }

  depends_on = [aws_sns_topic_policy.events]
}

resource "aws_sesv2_account_suppression_attributes" "bounces_only" {
  count              = var.manage_account_suppression ? 1 : 0
  suppressed_reasons = ["BOUNCE"]
}

# What the pods need: every SES action the app issues, plus reading the events
# queue. The queue grant is an identity policy here (same account), where the
# CloudFormation template puts it in the queue's resource policy for the IAM user.
resource "aws_iam_policy" "runtime" {
  name = "${var.name}-runtime"
  policy = jsonencode({
    Version = local.ses_policy.Version
    Statement = concat(local.ses_policy.Statement, [{
      Effect   = "Allow"
      Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
      Resource = aws_sqs_queue.events.arn
    }])
  })
  tags = var.tags
}
