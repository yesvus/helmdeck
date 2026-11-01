# Medusa host example

Configure `MEDUSA_API_URL` and the server-only `MEDUSA_ADMIN_API_KEY` in `.env.local` from `.env.example`. The admin token must not be exposed to browser code. This example is read-only: product creation and editing stay in Medusa Admin.

See [architecture.md](docs/architecture.md) for ownership boundaries, authentication requirements, and transport details. Compile with `npx tsc --noEmit -p examples/medusa-host/tsconfig.json` from the repository root.
