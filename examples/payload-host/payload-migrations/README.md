# Payload's migrations

Development pushes the schema to match the config, so this directory is empty until a deployment
needs it. `lib/payload/db.ts` points Payload's adapter here, and Payload writes its migrations
into it.

The procedure is three steps, and the order matters:

1. **Generate them in development**, with the schema the config describes:

   ```sh
   npx payload migrate:create
   ```

   The files it writes land in this directory. Review them, the way you review any schema change,
   and commit them with the rest of the application: a deployment cannot generate them, because it
   does not have the collection definitions and because it must not be altering the schema it is
   pointed at.

2. **Ship them.** They are part of the deployment artifact, beside the application that runs them.

3. **Run them against the deployment's database**, before the new application serves a request:

   ```sh
   npx payload migrate
   ```

`push` is off outside development (`lib/payload/db.ts`), because `push` alters whatever database it
is pointed at and a shared database must not be changed by a process starting up. A deployment that
skips the third step has an application whose tables do not exist yet, and the error says so.
