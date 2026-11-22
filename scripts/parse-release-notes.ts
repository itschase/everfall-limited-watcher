import { normalizeReleaseNote, RELEASE_GROUPS, type PublicReleaseNote, type ReleaseGroup } from "../src/shared/releaseNotes";

/** Parse only the explicitly public portion; never copy engineering notes. */
export function parseWebsiteReleases(markdown: string): PublicReleaseNote[] {
  const start = "<!-- website-releases:start -->";
  const end = "<!-- website-releases:end -->";
  if (markdown.split(start).length !== 2 || markdown.split(end).length !== 2 || markdown.indexOf(end) < markdown.indexOf(start))
    throw new Error("Changelog must contain exactly one ordered website release marker pair.");
  const block = markdown.slice(markdown.indexOf(start) + start.length, markdown.indexOf(end)).trim();
  const versions = new Set<string>();
  const releases: PublicReleaseNote[] = [];
  let draft: PublicReleaseNote | undefined;
  let group: ReleaseGroup | undefined;
  const finish = () => {
    if (!draft) return;
    const note = normalizeReleaseNote(draft);
    // Do not silently truncate public source or drop unsupported markup.
    if (JSON.stringify(note) !== JSON.stringify(draft)) throw new Error(`Release ${draft.version} exceeds content limits or contains unsupported text.`);
    if (versions.has(note.version)) throw new Error(`Duplicate website release version: ${note.version}`);
    versions.add(note.version);
    releases.push(note);
  };
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) {
      finish();
      const match = line.match(/^## ([^|]+) \| (\d{4}-\d{2}-\d{2}) \| (.+)$/);
      if (!match) throw new Error(`Invalid release heading: ${line}`);
      draft = { version: match[1].trim(), title: match[3].trim(), summary: "", date: match[2], published: true, highlights: [], additions: [], improvements: [], fixes: [] };
      group = undefined;
    } else if (!draft) {
      throw new Error("Public release content must start with a version heading.");
    } else if (line.startsWith("### ")) {
      group = (Object.keys(RELEASE_GROUPS) as ReleaseGroup[]).find(key => RELEASE_GROUPS[key] === line.slice(4));
      if (!group) throw new Error(`Unknown release section: ${line}`);
    } else if (line.startsWith("- ") && group) {
      draft[group].push(line.slice(2));
    } else if (!group && !line.startsWith("#") && !line.startsWith("- ")) {
      draft.summary += (draft.summary ? " " : "") + line;
    } else {
      throw new Error(`Unsupported public release line: ${line}`);
    }
  }
  finish();
  if (!releases.length) throw new Error("At least one website release is required.");
  return releases;
}
