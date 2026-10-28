output "database_url" {
  description = "DATABASE_URL for the app. verify-full needs the CA bundle below."
  sensitive   = true
  value       = "postgres://${aws_db_instance.this.username}:${random_password.master.result}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${aws_db_instance.this.db_name}?sslmode=verify-full"
}

output "ca_bundle" {
  description = "PEM bundle that verifies the RDS server certificate."
  value       = data.http.ca_bundle.response_body
}

output "endpoint" {
  value = aws_db_instance.this.address
}

output "security_group_id" {
  value = aws_security_group.this.id
}
