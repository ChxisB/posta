variable "name" {
  description = "Prefix of every resource this module creates."
  type        = string
  default     = "posta"
}

variable "app_base_url" {
  description = "Public https origin of the dashboard. Optional: adds an https push subscription (pending until the app confirms it) on top of the events queue the worker polls either way."
  type        = string
  default     = ""

  validation {
    condition     = var.app_base_url == "" || can(regex("^https://", var.app_base_url))
    error_message = "app_base_url must be an https:// URL, or empty."
  }
}

variable "manage_account_suppression" {
  description = "Set the account-level SES suppression list (per region) to bounces only, as the setup wizard does: a spam report is one sender's problem and Posta suppresses it per team. Account-wide: turn off if other workloads share this SES account."
  type        = bool
  default     = true
}

variable "tags" {
  type    = map(string)
  default = {}
}
