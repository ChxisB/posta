locals {
  chart = coalesce(var.chart, "${path.module}/../../../helm/posta")

  # What Terraform knows; everything else is the chart's defaults plus var.values.
  base_values = {
    image = {
      tag    = var.image_tag
      digest = var.image_digest
    }
    config = merge({
      appBaseUrl          = var.app_base_url
      publicApiUrl        = var.public_api_url
      unsubscribeBaseUrl  = var.unsubscribe_base_url
      awsRegion           = var.aws_region
      awsDefaultChain     = true
      sqsQueueUrl         = var.sqs_queue_url
      snsTopicArns        = var.sns_topic_arn
      sesConfigurationSet = var.ses_configuration_set
      }, var.trusted_proxies == "" ? {} : { trustedProxies = var.trusted_proxies }
    )
    secret         = { existingSecret = kubernetes_secret_v1.env.metadata[0].name }
    serviceAccount = { name = var.service_account_name }
    extraCA        = { configMapName = var.database_ca_bundle == "" ? "" : kubernetes_config_map_v1.ca[0].metadata[0].name }
  }
}

resource "kubernetes_namespace_v1" "this" {
  count = var.create_namespace ? 1 : 0

  metadata {
    name = var.namespace
  }
}

# MASTER_ENCRYPTION_KEY seals every email body at rest and roots the tracking
# and unsubscribe link keys. Losing or changing it makes stored bodies
# unrecoverable and kills every link already mailed, so Terraform refuses to
# destroy it. To tear down on purpose: terraform state rm module.<...>.random_id.master_key
resource "random_id" "master_key" {
  byte_length = 32

  lifecycle {
    prevent_destroy = true
  }
}

resource "random_id" "auth_secret" {
  byte_length = 32
}

resource "kubernetes_secret_v1" "env" {
  metadata {
    name      = "${var.release_name}-env"
    namespace = var.create_namespace ? kubernetes_namespace_v1.this[0].metadata[0].name : var.namespace
  }

  data = merge(var.secret_env, {
    DATABASE_URL          = var.database_url
    MASTER_ENCRYPTION_KEY = random_id.master_key.b64_std
    BETTER_AUTH_SECRET    = random_id.auth_secret.b64_std
  })
}

resource "kubernetes_config_map_v1" "ca" {
  count = var.database_ca_bundle == "" ? 0 : 1

  metadata {
    name      = "${var.release_name}-ca"
    namespace = kubernetes_secret_v1.env.metadata[0].namespace
  }

  data = { "ca.pem" = var.database_ca_bundle }
}

# EKS Pod Identity: the pods call SES and read the events queue with this
# role, so no access key exists anywhere.
resource "aws_iam_role" "app" {
  name = "${var.cluster_name}-${var.release_name}"
  tags = var.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "pods.eks.amazonaws.com" }
      Action    = ["sts:AssumeRole", "sts:TagSession"]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "runtime" {
  role       = aws_iam_role.app.name
  policy_arn = var.runtime_policy_arn
}

resource "aws_eks_pod_identity_association" "app" {
  cluster_name    = var.cluster_name
  namespace       = kubernetes_secret_v1.env.metadata[0].namespace
  service_account = var.service_account_name
  role_arn        = aws_iam_role.app.arn
  tags            = var.tags
}

resource "helm_release" "posta" {
  name      = var.release_name
  chart     = local.chart
  namespace = kubernetes_secret_v1.env.metadata[0].namespace

  # A failed install or upgrade rolls back instead of leaving a half-rolled release.
  atomic  = true
  timeout = var.timeout_seconds

  values = [
    yamlencode(local.base_values),
    yamlencode(var.values),
    yamlencode(var.extra_values),
  ]

  depends_on = [
    aws_eks_pod_identity_association.app,
    aws_iam_role_policy_attachment.runtime,
  ]
}
