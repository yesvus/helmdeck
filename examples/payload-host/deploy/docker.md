# Docker deployment

This reference host runs as a regular Docker image. It requires no managed database, storage
provider, or vendor-specific deployment service. A hosted libsql database and Vercel are optional
alternatives, not prerequisites.

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

No hosted database is required. If opting into hosted libsql, configure its URL and token through
the runtime environment and review its backup and migration procedures separately.
