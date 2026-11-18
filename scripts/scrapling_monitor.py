#!/usr/bin/env python3
"""
Everfall Limited Watcher - External Store Monitor powered by Scrapling
Fetches public Everfall Tebex Limited Cars listings using StealthyFetcher
and pushes verified snapshots to POST /cron with CRON_SECRET authentication.
"""

from __future__ import annotations

import html as html_lib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from typing import Any

from scrapling.fetchers import StealthyFetcher

PUBLIC_ORIGIN = os.environ.get(
    "PUBLIC_ORIGIN", "https://everfall-limited-watcher.itschase.workers.dev"
).rstrip("/")
WORKER_CRON_URL = os.environ.get("WORKER_CRON_URL", f"{PUBLIC_ORIGIN}/cron")
CRON_SECRET = os.environ.get("CRON_SECRET", "").strip()

STORE_URLS = [
    "https://store.everfallcommunity.com/category/limited-cars",
    "https://everfall.tebex.io/category/limited-cars",
]

KNOWN_LISTING_IDS = {"7815813", "7815819"}


def extract_html(page: Any) -> str:
    for attr in ("html_content", "text"):
        val = getattr(page, attr, None)
        if isinstance(val, str) and val.strip():
            return val
    body = getattr(page, "body", None)
    if isinstance(body, (bytes, bytearray)):
        return body.decode("utf-8", errors="replace")
    if isinstance(body, str) and body.strip():
        return body
    return str(page or "")


def extract_status(page: Any) -> int | None:
    for attr in ("status", "status_code"):
        val = getattr(page, attr, None)
        if isinstance(val, int):
            return val
    return None


def is_cloudflare_challenge(page_html: str, status_code: int | None) -> bool:
    if status_code in (403, 429, 503):
        if any(
            marker in page_html
            for marker in (
                "challenges.cloudflare.com",
                "Just a moment...",
                "Attention Required!",
                "cf-browser-verification",
            )
        ):
            return True
    return any(
        marker in page_html
        for marker in ("challenges.cloudflare.com", "Just a moment...", "Attention Required!")
    )


def decode_text(raw: str) -> str:
    cleaned = html_lib.unescape(raw)
    return re.sub(r"\s+", " ", cleaned).strip()


def fetch_page(url: str) -> tuple[int | None, str, str]:
    page = StealthyFetcher.fetch(
        url,
        headless=True,
        solve_cloudflare=True,
        network_idle=True,
        timeout=45000,
    )
    status_code = extract_status(page)
    page_html = extract_html(page)
    final_url = getattr(page, "url", None) or url
    return status_code, page_html, str(final_url)


def parse_package_details(pkg_id: str) -> dict[str, Any]:
    url = f"https://store.everfallcommunity.com/package/{pkg_id}"
    fallback = {
        "id": pkg_id,
        "name": f"Limited Vehicle #{pkg_id}",
        "description": "A new limited edition vehicle is now available on the Everfall store!",
        "url": url,
        "images": [],
    }
    try:
        status_code, pkg_html, _ = fetch_page(url)
        if (status_code and status_code >= 400) or is_cloudflare_challenge(pkg_html, status_code):
            return fallback

        og_title = re.search(
            r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
            pkg_html,
            re.IGNORECASE,
        )
        h1_title = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", pkg_html, re.IGNORECASE)
        raw_name = (
            og_title.group(1)
            if og_title
            else (re.sub(r"<[^>]+>", "", h1_title.group(1)) if h1_title else fallback["name"])
        )
        name = re.sub(r"\s*[|\-–]\s*Everfall.*$", "", decode_text(raw_name), flags=re.IGNORECASE).strip()
        if not name:
            name = fallback["name"]

        og_desc = re.search(
            r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
            pkg_html,
            re.IGNORECASE,
        )
        meta_desc = re.search(
            r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
            pkg_html,
            re.IGNORECASE,
        )
        description = decode_text(
            og_desc.group(1)
            if og_desc
            else (meta_desc.group(1) if meta_desc else fallback["description"])
        )

        images: list[str] = []
        seen_imgs: set[str] = set()
        og_img = re.search(
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            pkg_html,
            re.IGNORECASE,
        )
        if og_img and re.match(r"^https?://", og_img.group(1), re.IGNORECASE):
            seen_imgs.add(og_img.group(1))
            images.append(og_img.group(1))

        for img_url in re.findall(
            r'https://dunb17ur4ymx4\.cloudfront\.net/(?:packages/images|wysiwyg)/[^\s"\'<>]+',
            pkg_html,
            re.IGNORECASE,
        ):
            if img_url not in seen_imgs:
                seen_imgs.add(img_url)
                images.append(img_url)
                if len(images) >= 10:
                    break

        return {
            "id": pkg_id,
            "name": name,
            "description": description or fallback["description"],
            "url": url,
            "images": images,
        }
    except Exception as exc:
        print(f"Warning: failed to fetch package {pkg_id} details: {exc}", file=sys.stderr)
        return fallback


def get_currently_available_ids() -> list[str]:
    try:
        req = urllib.request.Request(
            f"{PUBLIC_ORIGIN}/api/public/listings",
            headers={"Accept": "application/json", "User-Agent": "EverfallLimitedWatcher-Sync/1.0"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return [
            str(item["id"])
            for item in data.get("listings", [])
            if item.get("isAvailable") and re.match(r"^\d+$", str(item.get("id", "")))
        ]
    except Exception as exc:
        print(f"Warning: unable to read current Worker listings: {exc}", file=sys.stderr)
        return []


def verify_sold_out(pkg_id: str) -> bool:
    url = f"https://store.everfallcommunity.com/package/{pkg_id}"
    try:
        status_code, pkg_html, _ = fetch_page(url)
        if status_code in (404, 410):
            return True
        if is_cloudflare_challenge(pkg_html, status_code):
            return False
        if re.search(r"Page Not Found|Package not found|404", pkg_html, re.IGNORECASE) and not re.search(
            r"Add to Basket|package/\d+", pkg_html, re.IGNORECASE
        ):
            return True
        return False
    except Exception:
        return False


def post_sync_to_worker(payload: dict[str, Any]) -> tuple[int, str]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        WORKER_CRON_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CRON_SECRET}",
            "X-Cron-Secret": CRON_SECRET,
            "User-Agent": "EverfallLimitedWatcher-Scrapling/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8", errors="replace")


def get_runner_metadata() -> tuple[str, str | None]:
    if os.environ.get("GITHUB_ACTIONS") == "true":
        runner_os = os.environ.get("RUNNER_OS", "Linux")
        server_url = os.environ.get("GITHUB_SERVER_URL", "https://github.com").rstrip("/")
        repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
        run_id = os.environ.get("GITHUB_RUN_ID", "").strip()
        run_url = f"{server_url}/{repo}/actions/runs/{run_id}" if repo and run_id else None
        return f"GitHub Actions ({runner_os}) • Scrapling", run_url
    return "External Python Runner • Scrapling", None


def main() -> int:
    if not CRON_SECRET:
        print("CRON_SECRET is not set; skipping Scrapling store sync.")
        return 0

    started = time.monotonic()
    last_http_status: int | None = None
    last_challenge = False
    last_length: int | None = None
    last_url = STORE_URLS[0]
    last_notice = "Scrapling verification was blocked; recorded history was preserved."
    runner_label, workflow_run_url = get_runner_metadata()
    attempts: list[dict[str, Any]] = []

    verified_payload: dict[str, Any] | None = None

    for store_url in STORE_URLS:
        attempt_started = time.monotonic()
        last_url = store_url
        try:
            status_code, page_html, final_url = fetch_page(store_url)
            challenged = is_cloudflare_challenge(page_html, status_code)
            attempt_ms = int((time.monotonic() - attempt_started) * 1000)
            last_http_status = status_code
            last_challenge = challenged
            last_length = len(page_html)
            last_url = final_url

            if (status_code and status_code >= 400) or challenged:
                note = "Cloudflare challenge" if challenged else f"HTTP {status_code}"
                last_notice = (
                    f"Cloudflare challenge (HTTP {status_code or 403}) blocked Scrapling on {store_url}."
                    if challenged
                    else f"Store returned HTTP {status_code} via Scrapling on {store_url}."
                )
                attempts.append(
                    {
                        "url": final_url,
                        "httpStatus": status_code,
                        "cloudflareChallenge": challenged,
                        "responseLength": len(page_html),
                        "durationMs": attempt_ms,
                        "note": note,
                    }
                )
                continue

            found_ids: list[str] = []
            seen_ids: set[str] = set()
            for pkg_id in re.findall(r'href="/package/(\d+)"', page_html):
                if pkg_id not in seen_ids:
                    seen_ids.add(pkg_id)
                    found_ids.append(pkg_id)

            confirmed_category = (
                len(page_html) > 200
                and (bool(re.search(r"Limited\s+Cars", page_html, re.IGNORECASE)) or len(found_ids) > 0)
                and (
                    bool(re.search(r"Tebex|everfall", page_html, re.IGNORECASE))
                    or len(found_ids) > 0
                )
            )
            if not confirmed_category:
                last_notice = "Scrapling response could not be confirmed as the Limited Cars category."
                attempts.append(
                    {
                        "url": final_url,
                        "httpStatus": status_code or 200,
                        "cloudflareChallenge": False,
                        "responseLength": len(page_html),
                        "durationMs": attempt_ms,
                        "note": "Unverified category markup",
                    }
                )
                continue

            attempts.append(
                {
                    "url": final_url,
                    "httpStatus": status_code or 200,
                    "cloudflareChallenge": False,
                    "responseLength": len(page_html),
                    "durationMs": attempt_ms,
                    "note": f"Verified ({len(found_ids)} package link{'' if len(found_ids) == 1 else 's'})",
                }
            )

            listings: list[dict[str, Any]] = []
            for pkg_id in found_ids:
                if pkg_id in KNOWN_LISTING_IDS:
                    listings.append({"id": pkg_id})
                else:
                    listings.append(parse_package_details(pkg_id))

            current_available = get_currently_available_ids()
            confirmed_sold_out = [
                pkg_id
                for pkg_id in current_available
                if pkg_id not in seen_ids and verify_sold_out(pkg_id)
            ]

            duration_ms = int((time.monotonic() - started) * 1000)
            verified_payload = {
                "verifiedStoreSync": True,
                "source": "scrapling",
                "authoritative": True,
                "httpStatus": status_code or 200,
                "cloudflareChallenge": False,
                "responseLength": len(page_html),
                "targetUrl": final_url,
                "durationMs": duration_ms,
                "runner": runner_label,
                "workflowRunUrl": workflow_run_url,
                "attempts": attempts,
                "listings": listings,
                "confirmedSoldOutIds": confirmed_sold_out,
            }
            break
        except Exception as exc:
            attempt_ms = int((time.monotonic() - attempt_started) * 1000)
            last_notice = f"Scrapling error on {store_url}: {exc}"
            attempts.append(
                {
                    "url": store_url,
                    "httpStatus": None,
                    "cloudflareChallenge": False,
                    "responseLength": None,
                    "durationMs": attempt_ms,
                    "note": str(exc)[:160],
                }
            )
            print(last_notice, file=sys.stderr)

    if verified_payload is None:
        duration_ms = int((time.monotonic() - started) * 1000)
        verified_payload = {
            "verifiedStoreSync": True,
            "source": "scrapling",
            "authoritative": False,
            "httpStatus": last_http_status,
            "cloudflareChallenge": last_challenge,
            "responseLength": last_length,
            "targetUrl": last_url,
            "durationMs": duration_ms,
            "notice": last_notice,
            "runner": runner_label,
            "workflowRunUrl": workflow_run_url,
            "attempts": attempts,
            "listings": [],
            "confirmedSoldOutIds": [],
        }

    worker_status, worker_body = post_sync_to_worker(verified_payload)
    print(f"Worker sync status={worker_status}: {worker_body}")

    if worker_status < 200 or worker_status >= 300:
        return 1
    if not verified_payload["authoritative"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
