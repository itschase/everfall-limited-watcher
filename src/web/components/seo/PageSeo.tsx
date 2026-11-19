import { useEffect } from "react";

const DEFAULT_TITLE = "Everfall Limited Watcher";
const DEFAULT_DESCRIPTION =
  "Track Everfall's limited vehicle releases, inspect verified stock availability, and receive instant alerts in Discord.";

function upsertMetaTag(
  attribute: "name" | "property",
  key: string,
  content: string
) {
  let tag = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`
  );
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function upsertCanonicalLink(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  );
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

export function PageSeo({
  title,
  description,
  canonicalUrl,
  jsonLd,
}: {
  title: string;
  description: string;
  canonicalUrl?: string;
  jsonLd?: Record<string, unknown>;
}) {
  useEffect(() => {
    const resolvedUrl =
      canonicalUrl ||
      (typeof window !== "undefined" ? window.location.href : "");

    document.title = title;
    upsertMetaTag("name", "description", description);
    upsertMetaTag("property", "og:title", title);
    upsertMetaTag("property", "og:description", description);
    upsertMetaTag("name", "twitter:title", title);
    upsertMetaTag("name", "twitter:description", description);

    if (resolvedUrl) {
      upsertMetaTag("property", "og:url", resolvedUrl);
      upsertCanonicalLink(resolvedUrl);
    }

    let scriptEl: HTMLScriptElement | null = null;
    if (jsonLd) {
      scriptEl = document.createElement("script");
      scriptEl.type = "application/ld+json";
      scriptEl.setAttribute("data-page-seo", "true");
      scriptEl.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(scriptEl);
    }

    return () => {
      document.title = DEFAULT_TITLE;
      upsertMetaTag("name", "description", DEFAULT_DESCRIPTION);
      upsertMetaTag("property", "og:title", DEFAULT_TITLE);
      upsertMetaTag("property", "og:description", DEFAULT_DESCRIPTION);
      upsertMetaTag("name", "twitter:title", DEFAULT_TITLE);
      upsertMetaTag("name", "twitter:description", DEFAULT_DESCRIPTION);
      if (scriptEl && scriptEl.parentNode) {
        scriptEl.parentNode.removeChild(scriptEl);
      }
    };
  }, [title, description, canonicalUrl, jsonLd]);

  return null;
}
