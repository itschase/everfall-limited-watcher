"""Extract explicit store prices without inferring an amount or currency."""

import json
import math
import re
from html.parser import HTMLParser
from typing import Any


def normalize_listing_price(amount: Any, currency: Any) -> dict[str, Any] | None:
    if isinstance(amount, bool) or not isinstance(amount, (str, int, float)):
        return None
    if not re.fullmatch(r"\d+(\.\d{1,2})?", str(amount)):
        return None
    if not isinstance(currency, str) or not re.fullmatch(r"[A-Z]{3}", currency):
        return None
    number = float(amount)
    if not math.isfinite(number) or not 0 <= number <= 1_000_000:
        return None
    return {"amount": number, "currency": currency}


def _offer_price(node: Any) -> dict[str, Any] | None:
    if isinstance(node, list):
        for item in node:
            price = _offer_price(item)
            if price:
                return price
    elif isinstance(node, dict):
        if node.get("@type") == "Offer":
            return normalize_listing_price(node.get("price"), str(node.get("priceCurrency", "")).upper())
        return _offer_price(node.get("offers") or node.get("@graph"))
    return None


class _PriceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.amount = None
        self.currency = None
        self.scripts: list[str] = []
        self.script: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "meta":
            prop = (attributes.get("property") or attributes.get("itemprop") or "").lower()
            if prop in ("product:price:amount", "price"):
                self.amount = attributes.get("content")
            if prop in ("product:price:currency", "pricecurrency"):
                self.currency = (attributes.get("content") or "").upper()
        elif tag == "script" and attributes.get("type", "").lower() == "application/ld+json":
            self.script = []

    def handle_data(self, data: str) -> None:
        if self.script is not None:
            self.script.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self.script is not None:
            self.scripts.append("".join(self.script))
            self.script = None


def extract_listing_price(page_html: str) -> dict[str, Any] | None:
    parser = _PriceParser()
    parser.feed(page_html)
    price = normalize_listing_price(parser.amount, parser.currency)
    if price:
        return price
    for script in parser.scripts:
        try:
            price = _offer_price(json.loads(script))
            if price:
                return price
        except (ValueError, RecursionError):
            continue
    return None
