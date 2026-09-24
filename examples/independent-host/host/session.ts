"use server";
import type { AdminSession } from "@yesvus/helmdeck";

const sampleSession: AdminSession = { email: "editor@example.test", name: "Sample editor", role: "editor" };

export async function getHostSession(): Promise<AdminSession | null> {
  return sampleSession;
}
