# Payload's migrations

Development pushes the schema to match the config, so this directory is empty until a deployment
needs it. `lib/payload/db.ts` points Payload's adapter here, and Payload writes its migrations
into it:

```sh
npx payload migrate:create
npx payload migrate
```

A deployment runs the second command against its own database, and `push` is off there, because
`push` alters whatever database it is pointed at and a shared database must not be changed by a
process starting up.
