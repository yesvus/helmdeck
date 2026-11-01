// SPDX-License-Identifier: MIT

import { NextResponse } from "next/server";
import { payloadInstance } from "../../../lib/payload/content";
import { allowFeedbackIntake } from "../../../lib/payload/feedback-intake-throttle";

export async function POST(request: Request) {
  try {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return NextResponse.json({ ok: false }, { status: 400 });
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 32 * 1024) return NextResponse.json({ ok: false }, { status: 400 });
    const text = await request.text();
    if (!text || new TextEncoder().encode(text).byteLength > 32 * 1024) return NextResponse.json({ ok: false }, { status: 400 });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false }, { status: 400 });
    const data = body as Record<string, unknown>;
    if (["name", "email", "subject", "message"].some((key) => typeof data[key] !== "string")) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const name = (data.name as string).trim();
    const email = (data.email as string).trim();
    const subject = (data.subject as string).trim();
    const message = (data.message as string).trim();
    if (!name || name.length > 120 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email) || email.length > 254 || !subject || subject.length > 160 || !message || message.length > 10000) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const trustedHeader = process.env.PAYLOAD_TRUSTED_PROXY_HEADER?.trim().toLowerCase();
    if (!allowFeedbackIntake({ email, subject, message, trustedProxyValue: trustedHeader ? request.headers.get(trustedHeader) : null })) return NextResponse.json({ ok: false }, { status: 429 });
    const payload = await payloadInstance();
    await payload.create({ collection: "feedback", overrideAccess: true, data: { name, email, subject, message, submitted_at: new Date().toISOString(), status: "new" } });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
