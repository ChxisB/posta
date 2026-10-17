variable "cluster_name" {
  description = "EKS cluster the pods run in; the Pod Identity association is made on it."
  type        = string
}

variable "namespace" {
  type    = string
  default = "posta"
}

variable "release_name" {
  type    = string
  default = "posta"
}

variable "service_account_name" {
  description = "The chart's ServiceAccount, which the Pod Identity association binds the role to."
  type        = string
  default     = "posta"
}

variable "chart" {
  description = "Path to the Helm chart. Null: the chart in this repository (deploy/helm/posta)."
  type        = string
  default     = null
}

variable "image_tag" {
  description = "Image tag. Empty: the chart's appVersion. Pin a version in production (or an image_digest)."
  type        = string
  default     = ""
}

variable "image_digest" {
  description = "Immutable sha256:... digest; wins over image_tag."
  type        = string
  default     = ""
}

variable "app_base_url" {
  description = "Public https origin of the dashboard."
  type        = string
}

variable "public_api_url" {
  description = "Public https origin of the API; its own hostname."
  type        = string
}

variable "unsubscribe_base_url" {
  type    = string
  default = ""
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "database_ca_bundle" {
  description = "PEM bundle the app trusts for outbound TLS (the RDS CA). Empty: none mounted."
  type        = string
  default     = ""
}

variable "aws_region" {
  type = string
}

variable "sqs_queue_url" {
  type = string
}

variable "sns_topic_arn" {
  type = string
}

variable "ses_configuration_set" {
  type = string
}

variable "runtime_policy_arn" {
  description = "Managed policy for the pods' role: modules/ses output runtime_policy_arn."
  type        = string
}

variable "trusted_proxies" {
  description = "CIDRs whose X-Forwarded-For is believed: the load balancers' subnets, i.e. the VPC CIDR. Empty: the chart's private ranges."
  type        = string
  default     = ""
}

variable "secret_env" {
  description = "Further secrets for the app's Secret (OAuth client secrets, MX_INGEST_SECRET, ...). Lands in the Terraform state."
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "values" {
  description = "Chart values merged over the ones this module sets: replicas, resources, ingress, smtp, mx, docs, env, ..."
  type        = any
  default     = {}
}

variable "extra_values" {
  description = "A last values file, deep-merged by Helm over `values`: use it to tweak one nested key (replicas, a resource limit) without repeating the block `values` sets."
  type        = any
  default     = {}
}

variable "create_namespace" {
  type    = bool
  default = true
}

variable "timeout_seconds" {
  description = "Helm's wait. Longer than the chart's migrations.timeoutSeconds (1800)."
  type        = number
  default     = 2400
}

variable "tags" {
  type    = map(string)
  default = {}
}
