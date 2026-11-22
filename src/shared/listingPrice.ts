export interface ListingPrice { amount: number; currency: string }
export function normalizeListingPrice(value: unknown): ListingPrice | undefined {
  if (!value || typeof value !== "object") return;
  const { amount, currency } = value as Record<string, unknown>;
  if ((typeof amount !== "number" && typeof amount !== "string") || String(amount).trim() === "" || !/^\d+(\.\d{1,2})?$/.test(String(amount))) return;
  const number = Number(amount);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000 || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return;
  try { new Intl.NumberFormat("en", { style: "currency", currency }).format(number); } catch { return; }
  return { amount: number, currency };
}
export function extractListingPrice(html: string): ListingPrice | undefined {
  let amount: string | undefined;
  let currency: string | undefined;
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map([...tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map((match) => [match[1].toLowerCase(), match[3]]));
    const property = (attributes.get("property") || attributes.get("itemprop") || "").toLowerCase();
    if (property === "product:price:amount" || property === "price") amount = attributes.get("content");
    if (property === "product:price:currency" || property === "pricecurrency") currency = attributes.get("content")?.toUpperCase();
  }
  const meta = normalizeListingPrice({ amount, currency });
  if (meta) return meta;
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const visit = (node: any): ListingPrice | undefined => {
        if (Array.isArray(node)) { for (const item of node) { const price = visit(item); if (price) return price; } }
        else if (node && typeof node === "object") {
          if (node["@type"] === "Offer") return normalizeListingPrice({ amount: node.price, currency: String(node.priceCurrency || "").toUpperCase() });
          return visit(node.offers || node["@graph"]);
        }
      };
      const price = visit(JSON.parse(match[1])); if (price) return price;
    } catch { /* Incomplete structured data is not a price. */ }
  }
}
