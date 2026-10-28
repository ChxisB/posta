variable "name" {
  description = "Prefix of every resource this module creates."
  type        = string
  default     = "posta"
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Private subnets (at least two availability zones) for the DB subnet group."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to reach Postgres on 5432: the cluster's pod/node security group."
  type        = list(string)
}

variable "instance_class" {
  description = "Each Posta process holds a pool of up to 24 connections; db.t4g.medium (about 450 connections) fits the default replica counts."
  type        = string
  default     = "db.t4g.medium"
}

variable "engine_version" {
  description = "Postgres major version; docker-compose runs 17."
  type        = string
  default     = "17"
}

variable "allocated_storage" {
  type    = number
  default = 50
}

variable "max_allocated_storage" {
  description = "Storage autoscaling ceiling in GiB."
  type        = number
  default     = 500
}

variable "multi_az" {
  type    = bool
  default = true
}

variable "backup_retention_days" {
  type    = number
  default = 14
}

variable "apply_immediately" {
  description = "Apply a class, storage or Multi-AZ change now (a resize costs a few minutes of downtime on a single-AZ database) instead of in the next maintenance window. Off by default so an unrelated apply never reboots the database."
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Blocks deleting the database. Turn off and apply before destroying it on purpose; a final snapshot is taken either way."
  type        = bool
  default     = true
}

variable "kms_key_id" {
  description = "KMS key for storage, snapshots and Performance Insights. Null: the AWS-managed aws/rds key."
  type        = string
  default     = null
}

variable "tags" {
  type    = map(string)
  default = {}
}
