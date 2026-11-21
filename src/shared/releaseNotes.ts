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
export const DEFAULT_RELEASE_NOTES: PublicReleaseNote[] = [
  {
    version: "2026.11.21",
    title: "More control, clearer previews, and easier server setup",
    summary:
      "This update makes Everfall Limited Watcher more comfortable to use on smaller screens and gives server owners more ways to keep their communities informed. It also brings a more flexible public site and a safer way to try listing events before using them with your community.",
    date: "2026-11-21",
    published: true,
    highlights: [
      "The dashboard now adapts more naturally when space is limited. Navigation, action buttons, forms, and data rows are easier to reach on smaller displays, helping you manage your server without constantly moving sideways across a page.",
      "Listing events can bring the vehicles in a release together in one place, with a generated cover showing up to three vehicles. Server managers can choose whether to enable automatic events and whether those events should end when the vehicles are no longer available.",
    ],
    additions: [
      "Server customizations now include options for pinning new listing messages, pinning the live widget, and keeping the widget closer to recent channel activity. Each server controls its own preferences.",
      "A dedicated event simulator lets administrators choose a test server, preview one-, two-, or three-vehicle covers, and create a clearly labeled test event for a chosen amount of time. Test events can also be ended early.",
      "This Changelog keeps members informed with versioned release notes explaining what has changed and how those changes affect everyday use.",
    ],
    improvements: [
      "Public pages have more flexible sections, clearer visibility controls, editable icons, and previews for different screen sizes. Hiding a section keeps its saved content ready for later.",
      "The page editor saves changes automatically and shows whether work is waiting, saving, saved, or needs another attempt. Pages can be edited independently without replacing changes on another page.",
      "Sold-out widget items take you to the preserved vehicle record. Opening a direct history link shows the full listing immediately, and closing it returns to the archive.",
    ],
    fixes: [
      "Improved the handling of high-resolution images when building multi-vehicle event covers, reducing unnecessary image work and keeping repeated test samples efficient.",
      "Updated labels and status explanations so it is easier to understand when widgets change and which settings affect only the information shown on the website.",
    ],
  },
];
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
