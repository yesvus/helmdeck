# Optional assistant

Helmdeck exports `AdminAssistantAdapter`, `AdminAssistantEvent`, `AdminAssistantTool`, and the opt-in `AdminAssistantPanel`. The adapter is provider-neutral and the host supplies tool implementations. Tools must authorize the current user and validate arguments on the server; never treat prompt text as authorization. A tool marked `requiresApproval` must be shown for explicit human approval before execution. The default shell does not mount the panel.

The Payload example uses `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and optional `OPENAI_MODEL_ID` only on the server. OpenAI-compatible providers vary in tool-call streaming and structured-output support. This initial example streams text and does not assume tool-call support; hosts should check their provider's capabilities before enabling those features. Provider credentials must never be sent to the browser or model output.
