resource "random_password" "master" {
  length  = 32
  special = false # lands in a URL
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_security_group" "this" {
  name_prefix = "${var.name}-db-"
  description = "Posta Postgres"
  vpc_id      = var.vpc_id
  tags        = merge(var.tags, { Name = "${var.name}-db" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "postgres" {
  for_each                     = toset(var.allowed_security_group_ids)
  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_db_parameter_group" "this" {
  name_prefix = "${var.name}-"
  family      = "postgres${var.engine_version}"
  tags        = var.tags

  # Mirrors deploy/docker-compose.yml: a queue fetch must never go parallel.
  parameter {
    name  = "max_parallel_workers_per_gather"
    value = "0"
  }

  # The default since Postgres 15, stated because the app's DATABASE_URL relies on it.
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "this" {
  identifier     = var.name
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  db_name  = "posta"
  username = "posta"
  password = random_password.master.result

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_id

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]
  publicly_accessible    = false
  parameter_group_name   = aws_db_parameter_group.this.name

  apply_immediately         = var.apply_immediately
  backup_retention_period   = var.backup_retention_days
  copy_tags_to_snapshot     = true
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-final"

  auto_minor_version_upgrade      = true
  performance_insights_enabled    = true
  performance_insights_kms_key_id = var.kms_key_id
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = var.tags
}

# RDS certificates are not in Node's trust store, so the app needs this bundle
# (the chart's extraCA) and sslmode=verify-full to verify the server.
data "http" "ca_bundle" {
  url = "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem"

  lifecycle {
    postcondition {
      condition     = self.status_code == 200
      error_message = "Could not download the RDS CA bundle."
    }
  }
}
