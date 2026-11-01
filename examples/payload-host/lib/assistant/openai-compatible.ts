// SPDX-License-Identifier: MIT

export async function* streamAssistant(messages: Array<{ role: string; content: string }>, signal?: AbortSignal, fetchModel: typeof fetch = fetch): AsyncGenerator<string> {
  const base = process.env.OPENAI_BASE_URL;
  const key = process.env.OPENAI_API_KEY;
  if (!base || !key) throw new Error("Assistant provider is not configured.");
  const response = await fetchModel(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST", signal, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL_ID ?? "gpt-4o-mini", stream: true, messages }),
  });
  if (!response.ok || !response.body) throw new Error("Assistant provider request failed.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
    for (const line of lines) if (line.startsWith("data: ") && line !== "data: [DONE]") {
      try { const data = JSON.parse(line.slice(6)); const text = data.choices?.[0]?.delta?.content; if (typeof text === "string") yield text; } catch { throw new Error("Assistant provider returned invalid stream data."); }
    }
    if (done) break;
  }
}
