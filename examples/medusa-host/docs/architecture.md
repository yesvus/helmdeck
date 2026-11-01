# Architecture and ownership

- **Helmdeck** supplies the admin shell, navigation, and shared presentation. It is not a commerce engine.
- **Medusa** owns commerce records and every commerce mutation. All create and edit work happens in Medusa Admin; this host only links there.
- **Payload** remains the editorial CMS and owns editorial content.
- **This host** owns authentication, authorization, and wiring the read-only views to Medusa.

## Read-only transport and credentials

The server calls Medusa's Admin REST API using plain `fetch` and `Authorization: Bearer`. Product list and detail use `GET /admin/products`; list requests ask for published products, and detail resolves a handle through the admin product query. No browser request, mutation call, duplicate commerce store, create/edit form, or Medusa SDK is part of this example. Commerce credentials stay server-side in `MEDUSA_ADMIN_API_KEY`. Never prefix it with `NEXT_PUBLIC_`, commit it, or pass it as a component prop. Put production values in the deployment secret store, as with `PAYLOAD_SECRET` in the Payload host.

The page calls the session resolver before invoking the client. Replace `currentAdminSession` with the host's verified session resolver; do not treat cookie presence as authentication. Every production host must apply its commerce-read permission at this same server boundary.
