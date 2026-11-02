/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import config from '@payload-config'
import '@payloadcms/next/css'
import type { ServerFunctionClient } from 'payload'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import React from 'react'
import { cookies } from 'next/headers'
import { globalsContent } from '@/lib/payload/content'
import { readPayloadSession } from '@/lib/session'
import { readPayloadSiteSettings } from '@/lib/payload/settings'
import { resolvePayloadDocumentTheme } from '@/lib/payload/theme-attrs'

import { importMap } from './payload/importMap.js'
import './payload.css'

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  })
}

/**
 * Payload's own document, which is why this host's routes live in `(helmdeck)`.
 *
 * This renders `<html>` itself, and a root layout at `app/layout.tsx` would wrap that in another
 * one, so this host's own routes and their root layout sit beside this group rather than above it.
 * The two products are two documents by Payload's design; the host does not pretend otherwise.
 *
 * The stylesheet beside it is the package's, which maps Payload's own variables onto Helmdeck's
 * tokens. It carries the tokens with it, so this document defines them without borrowing the
 * shell's stylesheet.
 */
const Layout = async ({ children }: { children: React.ReactNode }) => {
  const cookieStore = await cookies()
  let settings: { accent?: unknown; density?: unknown } = {}
  try {
    settings = await readPayloadSiteSettings({ store: globalsContent(), resolveUser: readPayloadSession })
  } catch (cause) {
    console.error('Failed to read the site settings for the Payload theme.', cause)
  }
  const { attrs } = resolvePayloadDocumentTheme(cookieStore.get('helmdeck_theme')?.value ?? null, settings)
  const payloadHtmlProps = { ...attrs, suppressHydrationWarning: true } as unknown as React.HtmlHTMLAttributes<HTMLHtmlElement>
  return <RootLayout config={config} importMap={importMap} serverFunction={serverFunction} htmlProps={payloadHtmlProps}>
    {children}
  </RootLayout>
}

export default Layout
