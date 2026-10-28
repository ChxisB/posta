output "dashboard_url" {
  description = "Open this to create the admin account: the first sign-up is the admin."
  value       = "https://${var.dashboard_host}"
}

output "api_url" {
  value = "https://${var.api_host}"
}

output "kubeconfig_command" {
  value = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.region}"
}

output "database_endpoint" {
  value = module.database.endpoint
}

output "ses_configuration_set" {
  value = module.ses.configuration_set_name
}
