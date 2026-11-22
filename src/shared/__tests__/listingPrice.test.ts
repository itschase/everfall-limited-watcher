import test from "node:test";
import assert from "node:assert/strict";
import { extractListingPrice, normalizeListingPrice } from "../listingPrice";
import { createLocalD1 } from "../../localD1";
import { upsertListingRecord, getListingRecordById } from "../../kv";
import { handleApiRequest } from "../../api";
import { createSessionToken } from "../../admin";
test("prices require explicit valid currency and survive archival without anonymous access", async () => {
  const price = { amount: 25.5, currency: "USD" };
  assert.deepEqual(extractListingPrice('<script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","price":"25.50","priceCurrency":"USD"}}</script>'), price);
  for (const value of [{ amount: -1, currency: "USD" }, { amount: "", currency: "USD" }, { amount: 5, currency: "$" }, { amount: Infinity, currency: "USD" }]) assert.equal(normalizeListingPrice(value), undefined);
  const db = createLocalD1(":memory:");
  const env: any = { DB: db, DISCORD_CLIENT_SECRET: "local-price-test", DISCORD_BOT: { get: async () => null, list: async () => ({ keys: [], list_complete: true }) } };
  try {
    await upsertListingRecord(env, "7815813", { name: "Vehicle", images: [], price }, true);
    await upsertListingRecord(env, "7815813", { name: "Vehicle", images: [] }, false);
    assert.deepEqual((await getListingRecordById(env, "7815813"))?.payload.price, price);
    const url = new URL("https://portal.example/api/listing-prices");
    assert.equal((await handleApiRequest(new Request(url), env, url))?.status, 401);
    const token = await createSessionToken("555555555555555555", "member", "", env.DISCORD_CLIENT_SECRET);
    const response = await handleApiRequest(new Request(url, { headers: { Cookie: `everfall_session=${token}` } }), env, url);
    assert.equal(response?.status, 200);
    assert.equal(response?.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual((await response!.json() as any).prices["7815813"], price);
    const detailUrl = new URL("https://portal.example/api/public/history/7815813");
    const anonymousDetail = await handleApiRequest(new Request(detailUrl), env, detailUrl);
    assert.equal(anonymousDetail?.status, 200);
    assert.doesNotMatch(JSON.stringify(await anonymousDetail!.json()), /"price"\s*:/);
  } finally { db.close(); }
});
