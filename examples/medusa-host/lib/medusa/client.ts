export interface MedusaProductPayload {
  id: string;
  title: string;
  handle: string;
  status?: string;
  description?: string | null;
  thumbnail?: string | null;
  variants?: Array<{ id: string; title: string; prices?: Array<{ amount: number; currency_code: string }> }>;
}

export interface MedusaListPayload { products: MedusaProductPayload[]; count: number }
export interface MedusaProduct { id: string; title: string; handle: string; status: string; description: string; thumbnail: string | null }
export interface MedusaProductDetail extends MedusaProduct { variants: Array<{ id: string; title: string; prices: Array<{ amount: number; currencyCode: string }> }> }

export class MedusaApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "MedusaApiError";
  }
}

export class MedusaAccessRefused extends Error {
  constructor() { super("An administrator session is required."); this.name = "MedusaAccessRefused"; }
}

export function mapMedusaProduct(product: MedusaProductPayload): MedusaProduct {
  return { id: product.id, title: product.title, handle: product.handle, status: product.status ?? "unknown", description: product.description ?? "", thumbnail: product.thumbnail ?? null };
}

export function mapMedusaProductDetail(product: MedusaProductPayload): MedusaProductDetail {
  return { ...mapMedusaProduct(product), variants: (product.variants ?? []).map((variant) => ({ id: variant.id, title: variant.title, prices: (variant.prices ?? []).map((price) => ({ amount: price.amount, currencyCode: price.currency_code })) })) };
}

function configuration() {
  const baseUrl = process.env.MEDUSA_API_URL?.trim();
  const token = process.env.MEDUSA_ADMIN_API_KEY?.trim();
  if (!baseUrl || !token) throw new MedusaApiError("Medusa is not configured.");
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

async function request<T>(path: string): Promise<T> {
  const { baseUrl, token } = configuration();
  try {
    const response = await fetch(`${baseUrl}/admin${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) throw new MedusaApiError(`Medusa request failed (${response.status}).`, response.status);
    return await response.json() as T;
  } catch (cause) {
    if (cause instanceof MedusaApiError) throw cause;
    throw new MedusaApiError("Medusa could not be reached.");
  }
}

export async function listProducts(resolveSession: () => Promise<unknown>) {
  if (!(await resolveSession())) throw new MedusaAccessRefused();
  const result = await request<MedusaListPayload>("/products?limit=50&order=-created_at&status=published");
  return { count: result.count, products: result.products.map(mapMedusaProduct) };
}

export async function getProduct(handle: string, resolveSession: () => Promise<unknown>) {
  if (!(await resolveSession())) throw new MedusaAccessRefused();
  const result = await request<{ products: MedusaProductPayload[] }>(`/products?handle=${encodeURIComponent(handle)}&limit=1`);
  const product = result.products[0];
  return product ? mapMedusaProductDetail(product) : null;
}

export function medusaConfigured() { return Boolean(process.env.MEDUSA_API_URL?.trim()); }
export function medusaAdminUrl() { return `${(process.env.MEDUSA_API_URL ?? "").replace(/\/$/, "")}/app/products`; }
