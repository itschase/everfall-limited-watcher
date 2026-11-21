export type SiteIconKey =
  | "none"
  | "bell"
  | "car-front"
  | "sparkles"
  | "images"
  | "shield-check"
  | "clock"
  | "database"
  | "server"
  | "lock"
  | "hard-drive"
  | "sliders-horizontal"
  | "layers"
  | "activity"
  | "send"
  | "history"
  | "file-text"
  | "scale"
  | "check-circle-2"
  | "zap"
  | "gauge"
  | "award"
  | "wrench"
  | "radio"
  | "bot"
  | "terminal"
  | "refresh-cw"
  | "eye"
  | "globe"
  | "megaphone"
  | "cpu"
  | "info"
  | "layout-dashboard"
  | "users"
  | "flame"
  | "star"
  | "layout-panel-top";

export interface SiteIconDefinition {
  key: SiteIconKey;
  label: string;
  category: string;
}

export const SITE_ICON_DEFINITIONS: readonly SiteIconDefinition[] = [
  { key: "none", label: "No icon", category: "Interface" },
  { key: "bell", label: "Bell Alert", category: "Alerts" },
  { key: "megaphone", label: "Announcement", category: "Alerts" },
  { key: "radio", label: "Live Signal", category: "Alerts" },
  { key: "send", label: "Dispatch", category: "Alerts" },
  { key: "zap", label: "Instant Trigger", category: "Alerts" },
  { key: "car-front", label: "Vehicle", category: "Vehicles" },
  { key: "gauge", label: "Performance", category: "Vehicles" },
  { key: "flame", label: "Limited Drop", category: "Vehicles" },
  { key: "star", label: "Featured", category: "Vehicles" },
  { key: "award", label: "Verified Drop", category: "Vehicles" },
  { key: "images", label: "Image Gallery", category: "Media" },
  { key: "eye", label: "Preview", category: "Media" },
  { key: "sparkles", label: "Highlights", category: "Media" },
  { key: "layout-panel-top", label: "Status Widget", category: "Interface" },
  { key: "layout-dashboard", label: "Dashboard", category: "Interface" },
  { key: "sliders-horizontal", label: "Customization", category: "Interface" },
  { key: "layers", label: "Architecture", category: "Interface" },
  { key: "bot", label: "Discord Bot", category: "Discord" },
  { key: "users", label: "Role Mentions", category: "Discord" },
  { key: "terminal", label: "Slash Commands", category: "Discord" },
  { key: "server", label: "Connected Server", category: "Discord" },
  { key: "activity", label: "Store Monitor", category: "Operations" },
  { key: "clock", label: "Schedule", category: "Operations" },
  { key: "refresh-cw", label: "Auto Sync", category: "Operations" },
  { key: "history", label: "Release Archive", category: "Operations" },
  { key: "wrench", label: "Recovery", category: "Operations" },
  { key: "database", label: "Cloudflare D1", category: "Infrastructure" },
  { key: "hard-drive", label: "Cloudflare R2", category: "Infrastructure" },
  { key: "cpu", label: "Edge Worker", category: "Infrastructure" },
  { key: "globe", label: "Web Portal", category: "Infrastructure" },
  { key: "shield-check", label: "Verified Protection", category: "Trust & Legal" },
  { key: "check-circle-2", label: "Confirmed Check", category: "Trust & Legal" },
  { key: "lock", label: "Privacy & Security", category: "Trust & Legal" },
  { key: "file-text", label: "Documentation", category: "Trust & Legal" },
  { key: "scale", label: "Terms & Rules", category: "Trust & Legal" },
  { key: "info", label: "Notice", category: "Trust & Legal" },
] as const;

const VALID_ICON_SET = new Set<string>(SITE_ICON_DEFINITIONS.map((d) => d.key));

export function isValidSiteIconKey(value: unknown): value is SiteIconKey {
  return typeof value === "string" && VALID_ICON_SET.has(value);
}

export function sanitizeSiteIconKey(
  value: unknown,
  fallback: SiteIconKey = "sparkles"
): SiteIconKey {
  return isValidSiteIconKey(value) ? value : fallback;
}
