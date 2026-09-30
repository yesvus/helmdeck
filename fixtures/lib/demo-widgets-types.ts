// SPDX-License-Identifier: MIT

/**
 * The shapes the tiles' actions answer with, named in one place.
 *
 * No directive on this module, deliberately. A `"use server"` module may only export async functions,
 * and the client half that builds the loaders needs to name these shapes without importing the action
 * module to do it, which would pull a server reference into the browser for a type. Types are erased at
 * build time, so this file costs the client bundle nothing.
 */

/** Cents throughout. The division by a hundred happens in the widget's formatter and nowhere else. */
export type WindowedMoney = { cents: number; previousCents: number; orders: number };

export type TileOrder = { id: string; customer: string; status: string; totalCents: number };

export type TileProduct = { id: string; name: string; sku: string; priceCents: number; stock: number };

export type RankedProduct = { key: string; label: string; units: number; cents: number };

export type DailyRevenue = { cents: number; days: Array<{ key: string; label: string; value: number }> };

/**
 * One thing that happened, as the store records it.
 *
 * `kind` is the column the tile maps to a tone, so it is kept beside the message rather than folded
 * into it: a sentence that carried its own tone would leave the tile with nothing to decide.
 */
export type ActivityEvent = {
  id: string;
  message: string;
  actor: string;
  at: string;
  kind: string;
};
