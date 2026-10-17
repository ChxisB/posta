terraform {
  required_version = ">= 1.5.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.30, < 3.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6"
    }
    http = {
      source  = "hashicorp/http"
      version = ">= 3.4"
    }
  }
}
