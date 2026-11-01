# Docker deployment

This reference host runs as a regular Docker image. It requires no managed database, storage
provider, or vendor-specific deployment service. SQLite is the default for development and a
single instance; PostgreSQL is the self-hosted shared-database path. Hosted libsql remains optional.

## Build and run

From the repository root, set a private Payload secret and start the compose service:

```sh
export PAYLOAD_SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')"
docker compose -f examples/payload-host/docker-compose.yml up --build -d
```

The service listens on port 3000 by default. Set `PORT` to change the host-side published port.
The image health check probes `http://localhost:3000/` and reports the container healthy when the
host returns a non-error response.

## Configuration

- `PAYLOAD_SECRET` is required. Supply a unique, long random value through the deployment's secret
  manager or environment, never through the Dockerfile or a committed env file.
- `PAYLOAD_DATABASE_URL` is explicitly set by Compose to `file:/app/data/payload.db`. Keep this
  local file URL for the named-volume deployment. `PAYLOAD_DATABASE_TOKEN` is only needed when
  deliberately choosing a hosted libsql database instead.
- `PORT` controls the host port published by Compose; the application listens on port 3000 inside
  the container.

## Persistence, permissions, and backups

Compose mounts the durable named volume `payload-data` at `/app/data`. The database file is
`/app/data/payload.db`. The image creates that directory owned by its non-root runtime account
(UID/GID 1001); preserve write access for that account when using a bind mount or copying data into
the volume. Do not store the database in the container writable layer.

Back up the SQLite database with a consistent SQLite-aware backup while the application is stopped,
or use SQLite's backup API. Restore the database into the same volume with ownership writable by
UID/GID 1001 before starting the service. Back up the Payload secret separately: losing it can
invalidate signed Payload tokens and sessions.

## Schema migrations

The container runs `payload migrate --disable-transpile` before starting Next.js. The flag uses
Node's native type stripping because tsx's loader breaks undici; the image pins undici to 7.29.1
because 7.30.1 breaks `CacheStorage`. `push` is development-only in
`lib/payload/db.ts`; production startup does not push schema changes. Create migrations during
development with `npx payload migrate:create`, review and commit the files under
`payload-migrations/`, then deploy them with the application. The startup migration runs against
the configured database before the app serves requests. Keep a database backup before deploying
schema changes, and coordinate concurrent application replicas so only one deployment process
runs migrations at a time.

## Shared PostgreSQL

Run the separate PostgreSQL compose configuration from the repository root:

```sh
export PAYLOAD_SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')"
export HELMDECK_SESSION_SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')"
docker compose -f examples/payload-host/docker-compose.postgres.yml up --build -d
```

The compose file includes a local PostgreSQL service and named data volume. Its default
`postgres://payload:payload@postgres:5432/payload` URL and credentials are examples only, change
them before using this configuration beyond local evaluation. `PAYLOAD_DATABASE_URL` accepts
`postgres:` or `postgresql:` URLs; keep the full URL in your deployment secret manager, with the
database credentials embedded in the URL. No additional database token variable is used. Keep
`PAYLOAD_SECRET` and `HELMDECK_SESSION_SECRET` secret and identical across instances that share
sessions, following the same secret-manager pattern as the SQLite deployment.

Generate and commit schema migrations with `npx payload migrate:create` during development. At
deployment, run `payload migrate --disable-transpile` once against the shared database before
scaling out or starting additional replicas. Never let multiple instances race to migrate the same
schema. Production schema changes use migrations, not `push`; development `push` is for local
development only. SQLite remains the no-configuration default for development and single-instance
use, not a shared multi-replica database.

The sign-in throttle is process-local: `lib/session.ts` supplies `createLoginThrottle()` to the
session adapter, and `src/baseline/throttle.ts` stores its counters in an in-memory `Map`. Payload's
account lockout is shared in the database, but it does not make this per-client throttle shared.
With more than one replica, do not enable this throttle as an effective cross-replica bound; use a
shared `AdminLoginThrottle` implementation supplied at the `throttle` option in `lib/session.ts`.

No hosted database is required. If opting into hosted libsql, configure its URL and token through
the runtime environment and review its backup and migration procedures separately.
# Feedback intake proxy trust

`PAYLOAD_TRUSTED_PROXY_HEADER` is unset by default, meaning no request header is trusted for client identity. Set it only to the exact header your trusted ingress overwrites. Forwarding headers such as `x-forwarded-for` are ignored unless explicitly configured.
