"""Offline regressions; no browser installation, store calls or cron writes."""
import sys
import types
import unittest
from unittest.mock import patch

from listing_price import extract_listing_price

# The scraper's browser transport is replaced before import for offline tests.
fetchers = types.ModuleType("scrapling.fetchers")
fetchers.StealthyFetcher = object
with patch.dict(sys.modules, {"scrapling": types.ModuleType("scrapling"), "scrapling.fetchers": fetchers}):
    import scrapling_monitor as monitor


class ScraperPricingTests(unittest.TestCase):
    def test_explicit_metadata_and_offers(self):
        samples = [
            ('<meta content="35.50" itemprop="price"><meta content="usd" itemprop="priceCurrency">', {"amount": 35.5, "currency": "USD"}),
            ('<meta property="product:price:amount" content="0"><meta property="product:price:currency" content="GBP">', {"amount": 0, "currency": "GBP"}),
            ('<script type="application/ld+json">{"@graph":[{"@type":"Product","offers":[{"@type":"Offer","price":"42.25","priceCurrency":"EUR"}]}]}</script>', {"amount": 42.25, "currency": "EUR"}),
            ('<meta itemprop="price" content="35">', None),
            ('<meta itemprop="price" content="-1"><meta itemprop="priceCurrency" content="USD">', None),
            ('<script type="application/ld+json">broken</script>', None),
            ('<p>Balance: $100.00. Stock: 35 remaining.</p>', None),
        ]
        for html, expected in samples:
            with self.subTest(html=html):
                self.assertEqual(extract_listing_price(html), expected)

    def test_known_and_new_packages_keep_details_and_prices(self):
        html = '<h1>Store vehicle</h1><meta itemprop="price" content="65.50"><meta itemprop="priceCurrency" content="USD">'
        with patch.object(monitor, "fetch_page", return_value=(200, html, "https://store.everfallcommunity.com")):
            for listing_id in ("7815813", "9999999"):
                listing = monitor.parse_package_details(listing_id)
                self.assertEqual(listing["name"], "Store vehicle")
                self.assertEqual(listing["price"], {"amount": 65.5, "currency": "USD"})

    def test_missing_and_blocked_prices_are_omitted(self):
        for status, html in [(200, "<h1>No price</h1>"), (403, "Just a moment...")]:
            with patch.object(monitor, "fetch_page", return_value=(status, html, "https://store.everfallcommunity.com")):
                self.assertNotIn("price", monitor.parse_package_details("7815813"))

    def test_scan_submits_prices_for_known_and_new_listings(self):
        category = '<h1>Limited Cars</h1>' + ' ' * 210 + '<a href="/package/7815813">Known</a><a href="/package/9999999">New</a>'
        package = '<h1>Vehicle</h1><meta itemprop="price" content="65.50"><meta itemprop="priceCurrency" content="USD">'

        def fetch(url):
            return (200, category if "/category/" in url else package, url)

        with (
            patch.object(monitor, "CRON_SECRET", "offline-test"),
            patch.object(monitor, "fetch_page", side_effect=fetch),
            patch.object(monitor, "get_currently_available_ids", return_value=[]),
            patch.object(monitor, "post_sync_to_worker", return_value=(200, "ok")) as submit,
        ):
            self.assertEqual(monitor.main(), 0)
            payload = submit.call_args.args[0]
            self.assertTrue(payload["authoritative"])
            self.assertEqual([item["id"] for item in payload["listings"]], ["7815813", "9999999"])
            for item in payload["listings"]:
                self.assertEqual(item["price"], {"amount": 65.5, "currency": "USD"})


if __name__ == "__main__":
    unittest.main()
