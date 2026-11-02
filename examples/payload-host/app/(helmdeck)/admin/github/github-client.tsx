// SPDX-License-Identifier: MIT

"use client";
import { useEffect, useState } from "react";

type Repository = { full_name: string; description: string | null; default_branch: string };
export function GitHubClient() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repository, setRepository] = useState("");
  const [description, setDescription] = useState("");
  const [readme, setReadme] = useState("");
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function call(action: string, patch?: { description: string; readme: string }, metadata?: object, name = repository) {
    const response = await fetch("/api/github", { method: action === "list" ? "GET" : "POST", headers: { "Content-Type": "application/json" }, ...(action === "list" ? {} : { body: JSON.stringify({ action, repository: name, patch, metadata }) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "GitHub request failed.");
    return result;
  }
  useEffect(() => { void fetch("/api/github").then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "GitHub request failed."); return result; }).then((result) => setRepositories(result.repositories)).catch((error: unknown) => setStatus(error instanceof Error ? error.message : "GitHub request failed.")); }, []);
  async function select(name: string) {
    setRepository(name); setPreview(false); setStatus("");
    if (!name) return;
    setBusy(true);
    try { const result = await call("read", undefined, undefined, name); setDescription(result.repository.description ?? ""); setReadme(result.readme); }
    catch (error) { setStatus(error instanceof Error ? error.message : "GitHub request failed."); }
    finally { setBusy(false); }
  }
  async function showPreview() {
    setBusy(true);
    try { await call("preview", { description, readme }); setPreview(true); setStatus(""); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Preview failed."); }
    finally { setBusy(false); }
  }
  async function publish() {
    setBusy(true);
    try { const result = await call("publish", { description, readme }, { branchName: `helmdeck/${Date.now()}`, commitMessage: "Update repository README", prTitle: "Update repository content" }); setStatus(`Pull request #${result.number} created: ${result.pullRequest}`); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Publish failed."); }
    finally { setBusy(false); }
  }
  return <section className="max-w-3xl space-y-4 rounded-lg border p-5">
    <label className="block">Repository<select className="mt-1 block w-full rounded border p-2" value={repository} onChange={(event) => void select(event.target.value)}><option value="">Select an authorized repository</option>{repositories.map((repo) => <option key={repo.full_name} value={repo.full_name}>{repo.full_name}</option>)}</select></label>
    {repository && <><label className="block">Description<input className="mt-1 block w-full rounded border p-2" maxLength={350} value={description} onChange={(event) => { setDescription(event.target.value); setPreview(false); }} /></label><label className="block">README content<textarea className="mt-1 block min-h-72 w-full rounded border p-2 font-mono" value={readme} onChange={(event) => { setReadme(event.target.value); setPreview(false); }} /></label><div className="flex gap-3"><button type="button" disabled={busy} onClick={() => void showPreview()} className="rounded border px-4 py-2">Preview</button><button type="button" disabled={busy || !preview} onClick={() => void publish()} className="rounded bg-primary px-4 py-2 text-primary-foreground">Publish as pull request</button></div></>}
    {preview && <article className="space-y-2 rounded border bg-muted p-4"><h2 className="font-semibold">Pull request preview</h2><p>{description}</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap">{readme}</pre></article>}
    {busy && <p role="status">Working…</p>}{status && <p role="status">{status}</p>}
  </section>;
}
