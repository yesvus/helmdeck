import "server-only";

export async function loadServerSignupCount() {
  return { total: 12 };
}

export async function loadServerCatalogTotals() {
  return { products: 8, units: 34 };
}

export async function loadServerRevenue() {
  await new Promise((resolve) => setTimeout(resolve, 150));
  return { cents: 12500, orders: 3 };
}
