import test from "node:test";
import assert from "node:assert/strict";
import { extractListingPrice } from "../listingPrice";
import { fetchStoreListings, KNOWN_LIMITED_CARS } from "../../scraper";
import { createLocalD1 } from "../../localD1";
import { getListingRecordById, upsertListingRecord } from "../../kv";

test("price metadata supports either attribute order and structured offer graphs", () => {
  assert.deepEqual(extractListingPrice('<meta content="35.50" itemprop="price"><meta content="usd" itemprop="priceCurrency">'), { amount: 35.5, currency: "USD" });
  assert.deepEqual(extractListingPrice('<meta property="product:price:amount" content="0"><meta property="product:price:currency" content="GBP">'), { amount: 0, currency: "GBP" });
  assert.deepEqual(extractListingPrice('<script type="application/ld+json">{"@graph":[{"@type":"Product","offers":[{"@type":"Offer","price":"42.25","priceCurrency":"EUR"}]}]}</script>'), { amount: 42.25, currency: "EUR" });
  for (const html of [
    '<meta itemprop="price" content="35">',
    '<meta itemprop="price" content="-1"><meta itemprop="priceCurrency" content="USD">',
    '<script type="application/ld+json">broken</script>',
    '<p>Balance: $100.00. Stock: 35 remaining.</p>',
  ]) assert.equal(extractListingPrice(html), undefined);
});

test("store scans refresh known and new listing prices while preserving history on missing prices", async () => {
  const originalFetch = globalThis.fetch;
  const db = createLocalD1(":memory:");
  const env = { DB: db };
  let mode: "priced" | "missing" | "blocked" = "priced";
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.includes("/category/")) return new Response('<h1>Limited Cars</h1>' + ' '.repeat(210) + '<a href="/package/7815813">Known</a><a href="/package/9999999">New</a>');
    if (mode === "blocked") return new Response("Just a moment...", { status: 403 });
    const price = mode === "priced" ? '<meta content="65.50" property="product:price:amount"><meta content="USD" property="product:price:currency">' : "";
    return new Response(`<h1>Fresh package title</h1>${price}`);
  };
  try {
    const result = await fetchStoreListings();
    assert.equal(result.authoritative, true);
    assert.ok(requested.some((url) => url.endsWith("/package/7815813")));
    assert.equal(result.listings[0].name, KNOWN_LIMITED_CARS.find((car) => car.id === "7815813")!.name);
    assert.equal(result.listings[1].name, "Fresh package title");
    for (const listing of result.listings) {
      assert.deepEqual(listing.price, { amount: 65.5, currency: "USD" });
      await upsertListingRecord(env, listing.id, listing, true);
    }
    for (const nextMode of ["missing", "blocked"] as const) {
      mode = nextMode;
      for (const listing of (await fetchStoreListings()).listings) {
        assert.equal(listing.price, undefined);
        await upsertListingRecord(env, listing.id, listing, true);
        assert.deepEqual((await getListingRecordById(env, listing.id))?.payload.price, { amount: 65.5, currency: "USD" });
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});
