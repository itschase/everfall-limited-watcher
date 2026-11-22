import { ensureD1Schema, getMonitorStateValue } from "./d1";

export const TEST_PREVIEW_LIFETIME_MS = 10 * 60_000;
const CHUNK_SIZE = 200_000;
export async function storeTestPreview(
  db: D1Database,
  guildId: string,
  options: unknown,
  preview: unknown,
) {
  await ensureD1Schema(db);
  const now = Date.now(),
    id = crypto.randomUUID(),
    key = `test-preview:${guildId}:${id}`;
  const text = JSON.stringify(preview);
  if (text.length > 6_000_000)
    throw new Error("The preview is too large. Try fewer vehicles.");
  const chunks = Math.ceil(text.length / CHUNK_SIZE);
  await db
    .prepare(
      "DELETE FROM monitor_state WHERE key LIKE 'test-preview:%' AND updated_at < ?",
    )
    .bind(now - TEST_PREVIEW_LIFETIME_MS)
    .run();
  const entries = [
    JSON.stringify({
      options,
      expiresAt: now + TEST_PREVIEW_LIFETIME_MS,
      chunks,
    }),
    ...Array.from({ length: chunks }, (_, i) =>
      JSON.stringify(text.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)),
    ),
  ];
  await db.batch(
    entries.map((value, i) =>
      db
        .prepare(
          "INSERT INTO monitor_state (key, updated_at, value_json) VALUES (?, ?, ?)",
        )
        .bind(i ? `${key}:${i}` : key, now, value),
    ),
  );
  return { previewId: id, previewExpiresAt: now + TEST_PREVIEW_LIFETIME_MS };
}
export async function loadTestPreview<T>(
  db: D1Database,
  guildId: string,
  id: string,
  options: unknown,
): Promise<T> {
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new Error("Generate a new event preview before deploying.");
  const key = `test-preview:${guildId}:${id}`;
  const manifest = await getMonitorStateValue<{
    options: unknown;
    expiresAt: number;
    chunks: number;
  }>(db, key);
  if (
    !manifest ||
    manifest.expiresAt <= Date.now() ||
    JSON.stringify(manifest.options) !== JSON.stringify(options)
  )
    throw new Error(
      "This preview expired or its settings changed. Generate a new preview.",
    );
  const chunks = await Promise.all(
    Array.from({ length: manifest.chunks }, (_, i) =>
      getMonitorStateValue<string>(db, `${key}:${i + 1}`),
    ),
  );
  if (chunks.some((chunk) => typeof chunk !== "string"))
    throw new Error("This preview is incomplete. Generate a new preview.");
  return JSON.parse(chunks.join("")) as T;
}
