import { sanitizeSiteIconKey, SiteIconKey } from "./icons";

export interface PublicContentSection {
  id: string;
  title: string;
  body: string;
  icon: SiteIconKey;
  enabled: boolean;
  buttonLabel: string;
  buttonUrl: string;
  alignment: "left" | "center";
  style: "subtle" | "bordered" | "elevated";
  spacing: "compact" | "standard" | "spacious";
  contentWidth?: "standard" | "wide";
  iconSize?: "small" | "medium" | "large";
  buttonStyle?: "outline" | "primary";
}
export interface PublicPageExtensions {
  extraSections?: PublicContentSection[];
  primaryCtaUrl?: string;
  secondaryCtaUrl?: string;
}
export function safePageDestination(input: unknown): string {
  if (typeof input !== "string") return "";
  const value = input.trim().slice(0, 1000);
  if (/^\/(?!\/)/.test(value) && !/[\\\u0000-\u0020]/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
const text = (value: unknown, limit: number) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .trim()
        .slice(0, limit)
    : "";
export function normalizePageExtensions(
  input: PublicPageExtensions,
  fallback: PublicPageExtensions,
): PublicPageExtensions {
  const sections = Array.isArray(input.extraSections)
    ? input.extraSections
    : fallback.extraSections || [];
  const ids = new Set<string>();
  return {
    primaryCtaUrl: safePageDestination(
      input.primaryCtaUrl ?? fallback.primaryCtaUrl,
    ),
    secondaryCtaUrl: safePageDestination(
      input.secondaryCtaUrl ?? fallback.secondaryCtaUrl,
    ),
    extraSections: sections
      .slice(0, 16)
      .filter((item) => item && typeof item === "object")
      .map((item, index) => {
        let id = text(item.id, 64) || `section-${index}`;
        if (ids.has(id)) id = `${id.slice(0, 50)}-${index}`;
        ids.add(id);
        return {
          id,
          title: text(item.title, 160),
          body: text(item.body, 2400),
          icon: sanitizeSiteIconKey(item.icon, "none"),
          enabled: item.enabled !== false,
          buttonLabel: text(item.buttonLabel, 60),
          buttonUrl: safePageDestination(item.buttonUrl),
          alignment: item.alignment === "center" ? "center" : "left",
          style: ["bordered", "elevated"].includes(item.style)
            ? item.style
            : "subtle",
          spacing: ["compact", "spacious"].includes(item.spacing)
            ? item.spacing
            : "standard",
          contentWidth: item.contentWidth === "wide" ? "wide" : "standard",
          iconSize:
            item.iconSize === "small" || item.iconSize === "large"
              ? item.iconSize
              : "medium",
          buttonStyle: item.buttonStyle === "primary" ? "primary" : "outline",
        } as PublicContentSection;
      }),
  };
}
