/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import config from '@payload-config'
import '@payloadcms/next/css'
import type { ServerFunctionClient } from 'payload'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import React from 'react'

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
const Layout = ({ children }: { children: React.ReactNode }) => (
  <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
    {children}
  </RootLayout>
)

export default Layout
