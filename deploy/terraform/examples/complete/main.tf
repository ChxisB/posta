provider "aws" {
  region = var.region
}

data "aws_availability_zones" "available" {
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  azs        = slice(data.aws_availability_zones.available.names, 0, 3)
  hosts      = compact([var.dashboard_host, var.api_host, var.unsubscribe_host, var.docs_host])
  tags       = { Application = "posta" }
  https_urls = { for k, v in { dashboard = var.dashboard_host, api = var.api_host, unsubscribe = var.unsubscribe_host } : k => v == "" ? "" : "https://${v}" }

  # var.tier sizes the stack, so cost follows customers. Pods and database are
  # linked: every pod pools up to 24 Postgres connections, so (web + api +
  # worker pods + 1 migration job) x 24 must stay under the class's
  # max_connections, and a tier's pod ceiling is what its database holds.
  # Starting points, not measurements. Each extra worker divides the SES rate.
  tiers = {
    starter = {
      single_nat = true
      db_class   = "db.t4g.small" # ~225 connections; 4 processes use up to 96
      multi_az   = false
      pods = {
        web    = { replicas = 1 }
        api    = { replicas = 1 }
        worker = { replicas = 1 }
      }
    }
    growth = {
      single_nat = true
      db_class   = "db.t4g.medium" # ~450; at most 14 processes, 336
      multi_az   = false
      pods = {
        web    = { autoscaling = { enabled = true, minReplicas = 2, maxReplicas = 6 } }
        api    = { autoscaling = { enabled = true, minReplicas = 2, maxReplicas = 6 } }
        worker = { replicas = 1 }
      }
    }
    ha = {
      single_nat = false
      db_class   = "db.t4g.large" # ~900; at most 23 processes, 552
      multi_az   = true
      pods = {
        web    = { autoscaling = { enabled = true, minReplicas = 2, maxReplicas = 10 } }
        api    = { autoscaling = { enabled = true, minReplicas = 2, maxReplicas = 10 } }
        worker = { replicas = 2 }
      }
    }
  }
  tier       = local.tiers[var.tier]
  single_nat = var.single_nat_gateway == null ? local.tier.single_nat : var.single_nat_gateway
  db_class   = var.database_instance_class == null ? local.tier.db_class : var.database_instance_class
}

# --- Network ---------------------------------------------------------------

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = var.name
  cidr = var.vpc_cidr
  azs  = local.azs

  private_subnets = [for i in range(3) : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets  = [for i in range(3) : cidrsubnet(var.vpc_cidr, 8, 192 + i)]

  enable_nat_gateway     = true
  single_nat_gateway     = local.single_nat
  one_nat_gateway_per_az = !local.single_nat

  # EKS Auto Mode finds the subnets for its load balancers by these tags.
  public_subnet_tags  = { "kubernetes.io/role/elb" = 1 }
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = 1 }

  tags = local.tags
}

# --- Cluster: EKS Auto Mode (compute, load balancing, storage and Pod Identity are built in)

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = var.name
  kubernetes_version = var.kubernetes_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  compute_config = {
    enabled    = true
    node_pools = ["general-purpose"]
  }

  # Public so Terraform and kubectl reach it from outside the VPC; restrict
  # endpoint_public_access_cidrs, or turn it off, once you run from inside.
  endpoint_public_access                   = true
  enable_cluster_creator_admin_permissions = true

  tags = local.tags
}

# --- AWS pieces Posta needs -------------------------------------------------

module "ses" {
  source = "../../modules/ses"

  name         = var.name
  app_base_url = local.https_urls.dashboard
  tags         = local.tags
}

module "database" {
  source = "../../modules/database"

  name                       = var.name
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.private_subnets
  allowed_security_group_ids = [module.eks.cluster_primary_security_group_id]
  instance_class             = local.db_class
  multi_az                   = local.tier.multi_az
  apply_immediately          = true # a tier change is deliberate, and the pods it grows need the bigger database now
  deletion_protection        = var.database_deletion_protection
  tags                       = local.tags
}

# --- TLS and DNS ------------------------------------------------------------

data "aws_route53_zone" "this" {
  name         = var.zone_name
  private_zone = false
}

resource "aws_acm_certificate" "this" {
  domain_name               = local.hosts[0]
  subject_alternative_names = slice(local.hosts, 1, length(local.hosts))
  validation_method         = "DNS"
  tags                      = local.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "validation" {
  for_each = {
    for o in aws_acm_certificate.this.domain_validation_options : o.domain_name => {
      name   = o.resource_record_name
      record = o.resource_record_value
      type   = o.resource_record_type
    }
  }

  zone_id         = data.aws_route53_zone.this.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}

# --- Cluster add-on: external-dns points the hostnames at the ALB -----------

data "aws_iam_policy_document" "external_dns" {
  statement {
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = [data.aws_route53_zone.this.arn]
  }
  statement {
    actions   = ["route53:ListHostedZones", "route53:ListResourceRecordSets", "route53:ListTagsForResources"]
    resources = ["*"]
  }
}

resource "aws_iam_role" "external_dns" {
  name = "${var.name}-external-dns"
  tags = local.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "pods.eks.amazonaws.com" }
      Action    = ["sts:AssumeRole", "sts:TagSession"]
    }]
  })
}

resource "aws_iam_role_policy" "external_dns" {
  role   = aws_iam_role.external_dns.id
  policy = data.aws_iam_policy_document.external_dns.json
}

resource "aws_eks_pod_identity_association" "external_dns" {
  cluster_name    = module.eks.cluster_name
  namespace       = "external-dns"
  service_account = "external-dns"
  role_arn        = aws_iam_role.external_dns.arn
}

resource "helm_release" "external_dns" {
  name             = "external-dns"
  repository       = "https://kubernetes-sigs.github.io/external-dns/"
  chart            = "external-dns"
  version          = "1.19.0"
  namespace        = "external-dns"
  create_namespace = true
  atomic           = true

  values = [yamlencode({
    provider       = { name = "aws" }
    sources        = ["ingress", "service"]
    domainFilters  = [var.zone_name]
    policy         = "upsert-only" # never deletes a record it did not create
    txtOwnerId     = var.name
    serviceAccount = { name = "external-dns" }
    env            = [{ name = "AWS_DEFAULT_REGION", value = var.region }]
  })]

  depends_on = [aws_eks_pod_identity_association.external_dns]
}

# --- Cluster add-on: the metrics API the web and api autoscalers (growth, ha) read.
# Auto Mode does not list one among its managed components, so install it.

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = "3.12.2"
  namespace  = "kube-system"
  atomic     = true
}

# --- Posta ------------------------------------------------------------------

module "posta" {
  source = "../../modules/posta"

  cluster_name = module.eks.cluster_name

  image_tag            = var.image_tag
  app_base_url         = local.https_urls.dashboard
  public_api_url       = local.https_urls.api
  unsubscribe_base_url = local.https_urls.unsubscribe

  database_url       = module.database.database_url
  database_ca_bundle = module.database.ca_bundle

  aws_region            = var.region
  sqs_queue_url         = module.ses.sqs_queue_url
  sns_topic_arn         = module.ses.sns_topic_arn
  ses_configuration_set = module.ses.configuration_set_name
  runtime_policy_arn    = module.ses.runtime_policy_arn

  # The ALB sits in the VPC's public subnets: believe its X-Forwarded-For, nobody else's.
  trusted_proxies = var.vpc_cidr

  tags = local.tags

  values = merge(local.tier.pods, {
    ingress = {
      className = "alb"
      annotations = {
        "alb.ingress.kubernetes.io/listen-ports" = jsonencode([{ HTTP = 80 }, { HTTPS = 443 }])
        "alb.ingress.kubernetes.io/ssl-redirect" = "443"
      }
      eksAutoMode = {
        create          = true
        scheme          = "internet-facing"
        certificateARNs = [aws_acm_certificate_validation.this.certificate_arn]
        groupName       = "posta"
      }
    }
    docs = var.docs_host == "" ? { enabled = false } : { enabled = true, host = var.docs_host }
  })

  secret_env   = var.posta_secret_env
  extra_values = var.posta_values

  depends_on = [helm_release.external_dns]
}
