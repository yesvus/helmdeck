# GitHub repository editing

The admin screen at `/admin/github` reads repositories visible to the configured GitHub App installation. It allows administrators to edit repository descriptions and README content, preview the exact text, and publish through a branch and pull request.

## Setup

Create a GitHub App, grant repository metadata read/write, contents read/write, and pull requests write permissions, then install it only on the repositories this host should manage. Create an installation access token and set `GITHUB_APP_INSTALLATION_TOKEN` in the host environment. The host operator refreshes this token before expiry. The eventual App JWT flow is a follow-up, not part of this integration.

The credential is read only by server-side code. Never put it in a `NEXT_PUBLIC_` variable or send it to a browser. The integration makes plain REST requests and adds no SDK dependency. Requests time out after ten seconds; API errors returned to the browser do not contain response bodies or stack traces.

## Boundaries

- Each operation checks the signed-in administrator session before making an external request.
- A repository must appear in the installation repository list. A submitted name outside that list is refused before any repository read or write.
- README content is limited to 512 KB and description text to 350 characters. The preview displays the content as plain text, without transforming it.
- Publishing creates a blob, tree, commit, branch ref, and pull request. It never updates a branch through a contents or direct-push endpoint. Repository description metadata is updated through GitHub's repository PATCH API as part of publish, since repository descriptions are not represented by Git commits.
- A bounded, process-local audit log records the actor, repository, operation, timestamp, and outcome. It is useful for the example, not durable or shared across replicas; production deployments should export these events to durable audit storage.
