output "role_arn" {
  description = "IAM role the pods assume."
  value       = aws_iam_role.app.arn
}

output "secret_name" {
  value = kubernetes_secret_v1.env.metadata[0].name
}

output "namespace" {
  value = kubernetes_secret_v1.env.metadata[0].namespace
}
