output "runtime_policy_arn" {
  description = "Managed policy for the role the pods assume (SES actions + the events queue)."
  value       = aws_iam_policy.runtime.arn
}

output "sqs_queue_url" {
  description = "SQS_QUEUE_URL"
  value       = aws_sqs_queue.events.url
}

output "sns_topic_arn" {
  description = "SNS_TOPIC_ARNS"
  value       = aws_sns_topic.events.arn
}

output "configuration_set_name" {
  description = "SES_CONFIGURATION_SET"
  value       = aws_sesv2_configuration_set.this.configuration_set_name
}
