# Kubernetes deployment

This is a portable starting point for running the Payload host on a Kubernetes cluster. It uses
standard Namespace, Secret, ConfigMap, Job, Deployment, Service, and Ingress resources. The cluster
operator supplies a PostgreSQL database, ingress implementation, DNS, and any TLS termination;
there are no cloud-specific annotations or storage-class assumptions.

## Build and configure

Build the existing `examples/payload-host/Dockerfile` from the repository root, then push the
result to a registry your cluster can access. Replace `EXAMPLE_IMAGE` in both workload manifests
with the same immutable image reference, for example `registry.example.invalid/team/payload-host:tag`.
The registry name is illustrative; use your own build and image distribution process. The runner
image already runs as UID/GID 1001. The Deployment repeats that identity as a pod security context.

The example expects PostgreSQL for shared multi-replica operation. Set `PAYLOAD_DATABASE_URL` to a
`postgres:` or `postgresql:` connection URL. SQLite's `file:` URL is suitable for development or a
single instance only; this example does not provision or share a SQLite volume.

`secret.yaml` is an illustrative manifest, not a safe place for real credentials. Change every
`change-me` value, and keep the file out of source control if populated. Alternatively, create the
Secret directly without putting values in a manifest:

```sh
kubectl create namespace payload-host
kubectl -n payload-host create secret generic payload-host-secrets \
  --from-literal=PAYLOAD_SECRET='replace-with-a-long-random-secret' \
  --from-literal=HELMDECK_SESSION_SECRET='replace-with-a-different-long-random-secret' \
  --from-literal=PAYLOAD_DATABASE_URL='postgresql://user:password@db.example.invalid:5432/payload'
```

`PAYLOAD_SECRET` signs Payload tokens. `HELMDECK_SESSION_SECRET` signs this host's sessions and
must be consistent across replicas. Keep both private. The ConfigMap contains only non-secret
runtime settings (`NODE_ENV` and `PORT`). `PAYLOAD_DATABASE_URL` carries the database credentials,
so it belongs in the Secret.

## Apply and migrate

Apply the namespace, Secret, and ConfigMap, then apply the migration Job before the Deployment:

```sh
kubectl apply -f examples/payload-host/deploy/kubernetes/namespace.yaml
kubectl apply -f examples/payload-host/deploy/kubernetes/secret.yaml
kubectl apply -f examples/payload-host/deploy/kubernetes/configmap.yaml
kubectl -n payload-host delete job payload-host-migrate --ignore-not-found
kubectl apply -f examples/payload-host/deploy/kubernetes/migration-job.yaml
kubectl -n payload-host wait --for=condition=complete job/payload-host-migrate --timeout=10m
kubectl apply -f examples/payload-host/deploy/kubernetes/deployment.yaml
kubectl apply -f examples/payload-host/deploy/kubernetes/service.yaml
kubectl apply -f examples/payload-host/deploy/kubernetes/ingress.yaml
```

The Job runs `payload migrate --disable-transpile` from the **same image** as the app and receives
the same database Secret. Run it once against the target database before starting or scaling app
replicas. For every schema-touching release, update the Job's image, delete or rename the completed
Job, apply the new Job, wait for completion, then roll out the Deployment. Do not run migration
commands concurrently or let application replicas race to migrate. The Deployment explicitly starts
`next start`, rather than the image's default command, because that command runs migrations at every
container start.

For a smoke test, wait for the rollout, then forward the Service port and request the root page:

```sh
kubectl -n payload-host rollout status deployment/payload-host
kubectl -n payload-host port-forward service/payload-host 8080:80
curl --fail http://localhost:8080/
```

## Operations and choices

- Both HTTP probes use `/`, the existing root page, also used by the Dockerfile health check. This
  app has no dedicated health route. The request verifies that Next.js serves a page; it is not a
  database health check. Use a lightweight health endpoint if the host adds one later.
- The resource requests and limits are starting points for the Next.js standalone runner. Measure
  the built workload and tune them for real traffic and memory use.
- The Service is internal (`ClusterIP`). The standard Ingress is only a routing skeleton. Replace
  `payload.example.invalid` and configure TLS, ingress class, authentication, and edge policy using
  the chosen ingress implementation's documentation. Ingress controllers and TLS solutions are
  operator choices.
- The Deployment has two replicas to show the shared-database pattern. Its login throttle is
  process-local; more than one replica needs a shared throttle backend before this throttle can be
  an effective cross-replica bound. This matches the Docker deployment guidance. Horizontal scaling
  does not change the rule: complete the migration Job before adding or rolling out replicas.
- This example provisions no persistent media storage. The host's local upload storage is not a
  shared multi-replica solution. Choose and configure a suitable storage adapter, or otherwise
  provide shared durable storage, using that provider's documentation.
- The image is non-root, but the example does not assume a particular cluster policy or storage
  implementation. Review security, backups, database availability, and termination behavior for
  the target cluster.
