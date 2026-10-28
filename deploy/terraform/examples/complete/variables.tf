variable "name" {
  description = "Cluster name and prefix of the AWS resources. IAM names are account-wide, so two stacks in one AWS account (say, one per region) need different names, e.g. posta-euw2."
  type        = string
  default     = "posta"
}

variable "region" {
  description = "Region of the cluster, the database and SES. Everything a team stores lives here: run one stack per region to keep customers' data in theirs."
  type        = string
  default     = "us-east-1"
}

variable "tier" {
  description = "How big the stack is, so cost follows customers: starter (one pod of each, single-AZ small database, one NAT gateway), growth (autoscaled web and api, medium database) or ha (Multi-AZ database, a NAT gateway per zone, more headroom). Change it and apply to move up; see deploy/README.md, \"Growing\"."
  type        = string
  default     = "starter"

  validation {
    condition     = contains(["starter", "growth", "ha"], var.tier)
    error_message = "tier must be starter, growth or ha."
  }
}

variable "zone_name" {
  description = "An existing public Route 53 hosted zone, e.g. example.com. The certificate and DNS records are made in it."
  type        = string
}

variable "dashboard_host" {
  description = "Hostname of the dashboard, e.g. mail.example.com. Must be inside zone_name."
  type        = string
}

variable "api_host" {
  description = "Hostname of the API, e.g. api.example.com. Its own host: its paths overlap the dashboard's."
  type        = string
}

variable "unsubscribe_host" {
  description = "Optional separate host for the hosted unsubscribe pages."
  type        = string
  default     = ""
}

variable "docs_host" {
  description = "Optional host for the documentation site; empty leaves it off."
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "Posta image tag. Pin a release (v* tags publish semver tags); `edge` follows main."
  type        = string
  default     = ""
}

variable "kubernetes_version" {
  type    = string
  default = "1.34"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "single_nat_gateway" {
  description = "Overrides the tier. One NAT gateway instead of one per zone: cheaper, and a zone outage then takes egress (SES, SQS, image pulls) down for every zone."
  type        = bool
  default     = null
}

variable "database_instance_class" {
  description = "Overrides the tier. Every pod pools up to 24 connections: keep (web + api + worker pods + 1) x 24 under the class's max_connections (about 225 on t4g.small, 450 on medium, 900 on large)."
  type        = string
  default     = null
}

variable "database_deletion_protection" {
  type    = bool
  default = true
}

variable "posta_values" {
  description = "Chart values deep-merged over the example's: replicas, resources, smtp, mx, env, ..."
  type        = any
  default     = {}
}

variable "posta_secret_env" {
  description = "Extra secret variables for the app, e.g. RECEIVING_MX_HOST and MX_INGEST_SECRET for inbound mail, or Stripe/OAuth credentials. Kept in state."
  type        = map(string)
  default     = {}
  sensitive   = true
}
