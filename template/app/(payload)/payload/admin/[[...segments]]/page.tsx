// SPDX-License-Identifier: MIT
import config from "../../../../../payload.config";
import { RootPage } from "@payloadcms/next/views";

const importMap = {};

export default function PayloadAdminPage({ params, searchParams }: { params: Promise<{ segments?: string[] }>; searchParams: Promise<Record<string, string | string[]>> }) {
  return RootPage({ config, params: params as Promise<{ segments: string[] }>, searchParams, importMap });
}
