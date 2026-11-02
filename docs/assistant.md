# Optional assistant

Helmdeck exports `AdminAssistantAdapter`, `AdminAssistantEvent`, `AdminAssistantTool`, and the opt-in `AdminAssistantPanel`. The adapter is provider-neutral and the host supplies tool implementations. Tools must authorize the current user and validate arguments on the server; never treat prompt text as authorization. A tool marked `requiresApproval` must be shown for explicit human approval before execution. The default shell does not mount the panel.

The Payload example uses `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and optional `OPENAI_MODEL_ID` only on the server. OpenAI-compatible providers vary in tool-call streaming and structured-output support. This initial example streams text and does not assume tool-call support; hosts should check their provider's capabilities before enabling those features. Provider credentials must never be sent to the browser or model output.

`sanitizeAssistantData` wraps repository and content values in a labeled quoted-data fence, truncates them to a bounded length, and escapes embedded fences. Use it whenever host data is added to a prompt. The wrapper marks the source as `untrusted-data`; this is prompt-injection hygiene, not authorization.

`AdminAssistantRunRecord` is the canonical run-history shape. The Payload example keeps the latest 100 rows in an in-memory store and exposes them on its admin-only history page. This example-local page is not a new renderable Helmdeck component. Hosts can persist the same records in their own store. Each tool record carries approval state, sanitized arguments/results, and an outcome.

The Payload example sends tool-call decisions to its admin-gated server route. That route rechecks the session, allowlists and executes approved tools, and records approvals, denials, and captured results server-side; browser-supplied history records are never accepted. Hosts should dispatch only registered tool names and apply an explicit allowlist before execution. Any future consequential tool must default-deny unless separately authorized and explicitly approved; `requiresApproval` alone is not permission.
