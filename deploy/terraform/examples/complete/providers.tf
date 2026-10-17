# The cluster is created in this same configuration, so these providers read
# its endpoint from the module outputs. On the very first run create it first
# (see README): terraform apply -target=module.eks
locals {
  cluster = {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    exec = {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name, "--region", var.region]
    }
  }
}

provider "kubernetes" {
  host                   = local.cluster.host
  cluster_ca_certificate = local.cluster.cluster_ca_certificate

  exec {
    api_version = local.cluster.exec.api_version
    command     = local.cluster.exec.command
    args        = local.cluster.exec.args
  }
}

provider "helm" {
  kubernetes = local.cluster
}
