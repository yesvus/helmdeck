// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";

const WINDOW_MS = 5 * 60_000;
const GLOBAL_WINDOW_MS = 15 * 60_000;
const GLOBAL_LIMIT = 100;
const KEY_LIMIT = 1024;
const buckets = new Map<string, { count: number; until: number }>();
// Keep the process-wide cap outside the bounded pool so key eviction cannot reset it.
let globalBucket: { count: number; until: number } | undefined;

export function allowFeedbackIntake(input: { email: string; subject: string; message: string; trustedProxyValue?: string | null }, now = Date.now()): boolean {
  for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key);
  if (globalBucket?.until && globalBucket.until <= now) globalBucket = undefined;
  const contentKey = `content:${createHash("sha256").update(`${input.email.trim()}\n${input.subject.trim()}\n${input.message.trim()}`).digest("hex")}`;
  const keys = [contentKey];
  if (input.trustedProxyValue?.trim()) keys.push(`proxy:${input.trustedProxyValue.trim()}`);
  if (globalBucket && globalBucket.count >= GLOBAL_LIMIT) return false;
  if (keys.some((key) => (buckets.get(key)?.count ?? 0) >= 1)) return false;
  if (!globalBucket) globalBucket = { count: 0, until: now + GLOBAL_WINDOW_MS };
  globalBucket.count += 1;
  for (const key of keys) {
    if (!buckets.has(key)) {
      if (buckets.size >= KEY_LIMIT) buckets.delete(buckets.keys().next().value!);
      buckets.set(key, { count: 0, until: now + WINDOW_MS });
    }
    buckets.get(key)!.count += 1;
  }
  return true;
}
