import { ensureD1Schema, getD1Database, setMonitorStateValue } from "./d1";
import {
  DEFAULT_RELEASE_NOTES,
  normalizeReleaseNote,
  PublicReleaseNote,
} from "./shared/releaseNotes";
export async function getReleaseNotes(
  env: any,
  includeDrafts = false,
): Promise<PublicReleaseNote[]> {
  const notes = new Map(
    DEFAULT_RELEASE_NOTES.map((note) => [note.version, note]),
  );
  const db = getD1Database(env);
  if (db) {
    await ensureD1Schema(db);
    const rows = await db
      .prepare(
        "SELECT value_json FROM monitor_state WHERE key LIKE 'public-release:%'",
      )
      .all<{ value_json: string }>();
    for (const row of rows.results) {
      try {
        const note = normalizeReleaseNote(JSON.parse(row.value_json));
        notes.set(note.version, note);
      } catch {
        /* Skip invalid legacy entries. */
      }
    }
  }
  return [...notes.values()]
    .filter((note) => includeDrafts || note.published)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.version.localeCompare(a.version, undefined, { numeric: true }),
    );
}
export async function saveReleaseNote(env: any, input: unknown) {
  const note = normalizeReleaseNote(input);
  const db = getD1Database(env);
  if (!db) throw new Error("Release-note storage is unavailable.");
  await setMonitorStateValue(db, `public-release:${note.version}`, note);
  return note;
}
