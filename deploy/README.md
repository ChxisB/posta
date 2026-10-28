# Deploying Posta on Kubernetes (AWS)

One Helm chart defines how Posta runs. Terraform builds the AWS around it and
installs that same chart. Pick how much to hand to Terraform; the running
workloads are identical either way.

| You have | Use | You provide |
|---|---|---|
| A cluster, Postgres and an SES setup already | Helm only (`deploy/helm/posta`) | `DATABASE_URL`, the two app secrets, SES wiring, ingress |
| Nothing yet | `deploy/terraform/examples/complete` | A Route 53 zone and the hostnames |
| Part of it (say, an existing VPC and cluster) | The modules you need | See "Mix and match" |

Out of scope here: the single-box Docker Compose install (`SELF_HOSTING.md`).

## Terraform, everything (new AWS account or empty VPC)

`terraform/examples/complete` creates a VPC, an EKS Auto Mode cluster, RDS
Postgres 17 (encrypted, TLS enforced; Multi-AZ from the `ha` tier), the SES configuration set with
its SNS topic and SQS queue, an ACM certificate, external-dns, an IAM role bound
to the app through EKS Pod Identity (no AWS access keys anywhere), and Posta.

```sh
cd deploy/terraform/examples/complete
cp terraform.tfvars.example terraform.tfvars   # zone and hostnames
cp backend.tf.example backend.tf               # remote state: see below, not optional
terraform init
terraform apply -target=module.eks             # first run only: the cluster must exist before the helm/kubernetes providers can connect
terraform apply
```

Then open the dashboard URL from the outputs: **the first account to sign up is
the admin**; sign-up is then invitation-only. Verify your sending domain from
the dashboard (DKIM records), and ask AWS for SES production access if the
account is still in the sandbox.

Pin `image_tag` to a release in production. Until the first `v*` tag is
published only `edge` (follows `main`) exists.

### Growing: cost follows customers

`tier` in `terraform.tfvars` sizes the whole stack. It starts small and you move
up by changing one word and applying; the pods and the database move together,
because every pod pools up to 24 Postgres connections.

| `tier` | Pods | Database | NAT | Roughly, per month |
|---|---|---|---|---|
| `starter` (default) | 1 web, 1 api, 1 worker | `db.t4g.small`, single-AZ | one | $200 |
| `growth` | web and api autoscale 2 to 6, 1 worker | `db.t4g.medium`, single-AZ | one | $250 to $400, rising with the pods |
| `ha` | web and api autoscale 2 to 10, 2 workers | `db.t4g.large`, Multi-AZ | one per zone | $500 and up |

The figures are my rough on-demand list prices for `us-east-1`, from memory and
not checked against AWS's price list; London costs about 10% more. About $105 of
the starter floor is the EKS control plane and one NAT gateway, which no tier
removes. SES is billed per message on top, so it grows with volume by itself.

- **When to move up.** `starter` to `growth` when the web or api pod is
  regularly above 70% CPU or you want two replicas for rollouts without a gap.
  `growth` to `ha` when an outage of one zone, or a 5-minute database resize,
  would cost you a customer. The numbers per tier are starting points, not
  measurements: watch CPU, memory and database connections, and tune with
  `posta_values` (deep-merged over the tier).
- **Moving up applies at once.** The database class and Multi-AZ change are
  applied immediately (`apply_immediately`): a class change on a single-AZ
  database costs a few minutes of downtime, so do it at a quiet hour. Moving
  down works the same way but check the pod ceiling first.
- **The database is the limit.** A tier's pod ceiling is what its database holds
  (`(web + api + worker pods + 1) × 24` under the class's `max_connections`).
  If you raise `maxReplicas` or enable `smtp`/`mx` pods, raise the class with
  them, or put RDS Proxy in front, which no tier does.
- **`single_nat_gateway` and `database_instance_class`** override the tier when
  you need a combination it does not offer.
- **Stay current on Kubernetes.** A cluster on a version past its standard
  support is billed a multiple of the control plane fee. Bump
  `kubernetes_version` before that date.

### More regions: one stack per region

Everything a team stores (contacts, logs, encrypted message bodies, attachments)
lives in the one database of the stack it signed up on, in that stack's
region. A second region is a second stack, not a setting:

1. Copy `terraform.tfvars` to a new file and set `region`, `name` (IAM names are
   account-wide, so it must differ, e.g. `posta-euw2`) and its own hostnames,
   such as `eu.mail.example.com` and `eu.api.example.com`.
2. Give it its own state: a different `key` in `backend.tf`, or a separate
   working copy of the example.
3. Start it at `tier = "starter"`: an unused region costs the floor above, so
   bring one up when a customer needs it, not before.
4. Request SES production access in that region.
5. To let people choose at sign-up, set `REGION_STACKS` on every stack, its own
   included, in `posta_values.env`:
   `eu-west-2=https://eu.mail.example.com,us-east-1=https://mail.example.com`.
   `/signup` then shows a Region field, and picking another region continues on
   that stack's sign-up. Each URL must be the stack's dashboard address, and
   the list must include the stack's own region or it refuses to boot.

London (`eu-west-2`), Ireland, Frankfurt, N. Virginia, São Paulo and Tokyo are
known to the dashboard; the stack serves the region it runs in. Stacks stay
separate: each has its own accounts and its own first admin, signing in on the
wrong stack fails like a wrong password, and a Stripe webhook endpoint (with its
own `STRIPE_WEBHOOK_SECRET`) is registered per stack. Not built: a shared login
or shared billing across stacks.

### State is a secret

The state holds `MASTER_ENCRYPTION_KEY` (it encrypts credentials stored in the
database) and the database password in clear text. Use the S3 backend in
`backend.tf.example`: versioned bucket, KMS encryption, public access blocked,
read access limited to the people who may read production secrets. Never run
this with local state past a first try.

`MASTER_ENCRYPTION_KEY` has `prevent_destroy`: losing or rotating it makes the
stored credentials unreadable. A full `terraform destroy` therefore stops at it
on purpose; `terraform state rm` it only when you mean to discard the data. The
database has `deletion_protection` on and takes a final snapshot.

## Helm only

```sh
kubectl create namespace posta
kubectl -n posta create secret generic posta-env \
  --from-literal=DATABASE_URL='postgres://…?sslmode=verify-full' \
  --from-literal=MASTER_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  --from-literal=BETTER_AUTH_SECRET="$(openssl rand -base64 32)"

helm install posta deploy/helm/posta -n posta -f my-values.yaml
```

A starting `my-values.yaml`:

```yaml
image: { tag: "0.1.0" }
config:
  appBaseUrl: https://mail.example.com
  publicApiUrl: https://api.example.com   # its own host: its paths overlap the dashboard's
  awsRegion: us-east-1
  sqsQueueUrl: …                          # from the SES setup (modules/ses, or the setup wizard)
  snsTopicArns: …
  sesConfigurationSet: …
secret: { existingSecret: posta-env }     # also enables the pre-upgrade migration Job
ingress:
  className: nginx                        # or alb; see values.yaml for EKS Auto Mode
```

`helm show values deploy/helm/posta` is the full, commented reference. Every
other variable in `.env.example` goes in `env:` (plain) or in the Secret.

- **AWS access** — leave `config.awsDefaultChain: true` and give the pods a role
  with `modules/ses`'s `runtime_policy_arn` (Pod Identity binds by service
  account name, default `posta`; IRSA needs `serviceAccount.annotations`).
  Without a role, put `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in the Secret
  and set `awsDefaultChain: false`.
- **Migrations** run as a `helm upgrade` pre-hook Job (a failing migration stops
  the release before any pod rolls) and again, advisory-locked, at every
  process boot.
- **Mode** — `split` (default) runs web, api and worker as separate
  Deployments; `all` runs one pod like Compose.
- **Workers** — each paces SES at the account rate divided by `worker.replicas`;
  rollouts never run two extra, so the combined rate stays under the limit.
- **Postgres connections** — every process holds a pool of up to 24. Defaults
  (2 web + 2 api + 1 worker + the hook) fit RDS `db.t4g.medium`; size
  `max_connections` (or add RDS Proxy) before scaling replicas out.
- **RDS TLS** — RDS requires TLS and its certificates are not in Node's store.
  Create a ConfigMap with the RDS global bundle, set `extraCA.configMapName`,
  and use `sslmode=verify-full`. (`require` is treated differently by the two
  Postgres drivers the app uses; `verify-full` plus the CA is the one setting
  that works for both.) Terraform does all of this for you.

### SMTP relay and inbound mail

Both are plain TCP, so they get Network Load Balancers rather than the ingress:

```yaml
smtp:
  enabled: true
  tls: { secretName: posta-smtp-tls }     # a kubernetes.io/tls Secret, e.g. from cert-manager
  service:
    loadBalancerClass: eks.amazonaws.com/nlb   # EKS Auto Mode
    annotations:
      service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
mx:                                       # receiving (beta)
  enabled: true
  hostname: mx.example.com
  tls: { secretName: posta-mx-tls }
  service:
    loadBalancerClass: eks.amazonaws.com/nlb
    annotations:
      service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
```

`mx` also needs `RECEIVING_MX_HOST` and `MX_INGEST_SECRET` (32+ characters) in
the app Secret. Point your DNS at the NLB addresses with
`kubectl -n posta get svc`. cert-manager is not installed by the example; bring
your own, or leave TLS off on a private network (`smtp.allowInsecureAuth`).
Through Terraform, pass the block above as `posta_values` and the two variables
as `posta_secret_env`.

## Mix and match

| Module | Creates | Needs |
|---|---|---|
| `modules/ses` | SNS topic, SQS queue, SES configuration set + event destination, runtime IAM policy | An AWS account |
| `modules/database` | RDS Postgres 17, parameter group, security group, `DATABASE_URL` | A VPC and subnets |
| `modules/posta` | Namespace, Secret, Pod Identity role, the Helm release | A cluster and the outputs of the two above (or your own values) |

For an existing cluster and VPC, call the three modules from your own root
module; `examples/complete/main.tf` shows the wiring. To go from Terraform back
to Helm only, `terraform state rm` the `helm_release` and take over the
release with `helm upgrade`; the Secret and Pod Identity role stay where they are.

## What was and was not verified

Checked offline: `helm lint`, `helm template` in split and all mode and with the
example's values, strict YAML parsing of the rendered output, `terraform fmt`
and `terraform validate` on every module and the example, and a test that pins
the Terraform IAM policy and SES event types to the ones the application uses
(`packages/ses/test/iam-policy.test.ts`).

Not checked, because it needs a real account or cluster:

- `terraform plan`/`apply`, and the chart on a live cluster.
- On EKS Auto Mode, whether the ALB honours the per-Service health-check
  annotations the chart sets (`/robots.txt` for the dashboard, `/health` for the
  API). If targets show unhealthy, set the health-check path on the Ingress
  instead.
- Client-IP preservation on the SMTP and MX NLBs. In IP target mode the client
  address is not kept by default, which would break the inbound SPF check. If
  needed, add
  `service.beta.kubernetes.io/aws-load-balancer-target-group-attributes: preserve_client_ip.enabled=true`
  to the Service annotations, and confirm in a test message's headers.
- Upgrades across chart versions, and the HPA settings under load. Resource
  requests are starting points, not measurements.
- Whether EKS Auto Mode already ships a metrics-server. AWS's Auto Mode pages do
  not list one, so the example installs the upstream chart into `kube-system`;
  if the install fails because `v1beta1.metrics.k8s.io` already exists, drop
  `helm_release.metrics_server`. Check with `kubectl top pods -n posta`: until
  that works, the `growth` and `ha` autoscalers stay at their minimum.
