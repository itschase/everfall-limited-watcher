import publishedReleaseNotes from "./publishedReleaseNotes.json";
export const RELEASE_GROUPS = {
  highlights: "Highlights",
  additions: "New additions",
  improvements: "Improvements",
  fixes: "Fixes",
} as const;
export type ReleaseGroup = keyof typeof RELEASE_GROUPS;
export interface PublicReleaseNote {
  version: string;
  title: string;
  summary: string;
  date: string;
  published: boolean;
  highlights: string[];
  additions: string[];
  improvements: string[];
  fixes: string[];
}
// Generated from the explicitly member-facing section of CHANGELOG.md.
export const DEFAULT_RELEASE_NOTES: PublicReleaseNote[] = publishedReleaseNotes;
const clean = (value: unknown, max: number) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .trim()
        .slice(0, max)
    : "";
export function normalizeReleaseNote(input: unknown): PublicReleaseNote {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const version = clean(source.version, 40),
    title = clean(source.title, 160),
    summary = clean(source.summary, 2400),
    date = clean(source.date, 10);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(version))
    throw new Error(
      "Use a version containing letters, numbers, dots, hyphens, or underscores.",
    );
  if (!title || !summary)
    throw new Error("A release title and summary are required.");
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  )
    throw new Error("Choose a valid release date.");
  const groups = Object.fromEntries(
    Object.keys(RELEASE_GROUPS).map((key) => [
      key,
      Array.isArray(source[key])
        ? source[key]
            .slice(0, 12)
            .map((value) => clean(value, 2400))
            .filter(Boolean)
        : [],
    ]),
  ) as Pick<PublicReleaseNote, ReleaseGroup>;
  if (!Object.values(groups).some((items) => items.length))
    throw new Error(
      "Add at least one highlight, addition, improvement, or fix.",
    );
  return {
    version,
    title,
    summary,
    date,
    published: source.published === true,
    ...groups,
  };
}
