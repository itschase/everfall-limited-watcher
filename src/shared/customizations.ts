export const DEFAULT_CUSTOMIZATIONS = {
  autoPinListings: false,
  autoCreateEvent: false,
  autoEndEvent: true,
  pinWidget: false,
  stickyWidget: false,
};
export type ServerCustomizations = typeof DEFAULT_CUSTOMIZATIONS;
export function normalizeCustomizations(input: unknown): ServerCustomizations {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_CUSTOMIZATIONS).map(([key, fallback]) => [
      key,
      typeof source[key] === "boolean" ? source[key] : fallback,
    ]),
  ) as ServerCustomizations;
}
