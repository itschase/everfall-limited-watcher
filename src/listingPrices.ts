import { getD1Database, getMonitorStateValue, setMonitorStateValue } from "./d1";
import { normalizeListingPrice } from "./shared/listingPrice";
export async function getListingPriceOverrides(env: any) {
  const db = getD1Database(env);
  if (!db) return new Map<string, { price: unknown }>();
  const rows = await db.prepare("SELECT key, value_json FROM monitor_state WHERE key LIKE 'listing-price:%'").all<{ key: string; value_json: string }>();
  const result = new Map<string, { price: unknown }>();
  for (const row of rows.results) { try { result.set(row.key.slice(14), JSON.parse(row.value_json)); } catch { /* Ignore invalid saved data. */ } }
  return result;
}
export async function getEffectiveListingPrice(env: any, id: string, recorded: unknown) {
  const db = getD1Database(env);
  const override = db ? await getMonitorStateValue<{ price: unknown }>(db, `listing-price:${id}`) : null;
  return override ? normalizeListingPrice(override.price) : normalizeListingPrice(recorded);
}
export async function setManualListingPrice(env: any, id: string, price: unknown) {
  const db = getD1Database(env);
  if (!db) throw new Error("Price storage is unavailable.");
  if (price !== null && !normalizeListingPrice(price)) throw new Error("Enter a valid amount and three-letter currency code.");
  await setMonitorStateValue(db, `listing-price:${id}`, { price: price === null ? null : normalizeListingPrice(price) });
}
