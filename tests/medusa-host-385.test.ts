import { describe, expect, it, vi } from "vitest";
import { commerceNav } from "../examples/medusa-host/lib/commerce-nav";
import { getProduct, listProducts, mapMedusaProduct, mapMedusaProductDetail, MedusaAccessRefused } from "../examples/medusa-host/lib/medusa/client";

const product = { id: "p1", title: "Mug", handle: "mug", status: "published", description: null, variants: [{ id: "v1", title: "Default", prices: [{ amount: 1200, currency_code: "usd" }] }] };

describe("Medusa host 385", () => {
  it("maps list and detail payloads to plain view models", () => {
    expect(mapMedusaProduct(product)).toMatchObject({ id: "p1", title: "Mug", description: "" });
    expect(mapMedusaProductDetail(product).variants[0]?.prices[0]).toEqual({ amount: 1200, currencyCode: "usd" });
  });

  it("refuses without a session before making a Medusa fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ products: [] })));
    await expect(listProducts(async () => null)).rejects.toBeInstanceOf(MedusaAccessRefused);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("surfaces API failures as typed, non-stack messages", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 503 }));
    process.env.MEDUSA_API_URL = "https://medusa.example";
    process.env.MEDUSA_ADMIN_API_KEY = "test-token";
    await expect(getProduct("mug", async () => ({ userId: "u1" }))).rejects.toMatchObject({ name: "MedusaApiError", status: 503, message: "Medusa request failed (503)." });
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });

  it("adds commerce navigation only when configured", () => {
    expect(commerceNav(false)).toEqual([]);
    expect(commerceNav(true)).toEqual([{ label: "Commerce", items: [{ href: "/commerce", label: "Products", icon: "article" }] }]);
  });
});
