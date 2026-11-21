import test from "node:test";
import assert from "node:assert/strict";
import { createLocalD1 } from "../../localD1";
import { DEFAULT_RELEASE_NOTES, normalizeReleaseNote } from "../releaseNotes";
import { getReleaseNotes, saveReleaseNote } from "../../releaseNotes";
import { createSessionToken } from "../../admin";
import { handleApiRequest } from "../../api";

test("release notes validate human-facing content, safe versions and calendar dates", () => {
  const source = DEFAULT_RELEASE_NOTES[0];
  assert.doesNotMatch(
    JSON.stringify(DEFAULT_RELEASE_NOTES),
    /cloudflare|gemini|codex|typescript|wrangler|sqlite|\bKV\b|\bD1\b/i,
  );
  assert.equal(
    normalizeReleaseNote({ ...source, title: "<b>New features</b>" }).title,
    "New features",
  );
  for (const date of ["invalid", "2026-13-01", "2026-02-30", "2026-02-00"])
    assert.throws(
      () => normalizeReleaseNote({ ...source, date }),
      /valid release date/,
    );
  for (const version of ["", "../secret", "v1 space", "<script>"])
    assert.throws(() => normalizeReleaseNote({ ...source, version }));
  assert.throws(
    () =>
      normalizeReleaseNote({
        ...source,
        highlights: [],
        additions: [],
        improvements: [],
        fixes: [],
      }),
    /at least one/,
  );
});

test("version updates preserve other releases, drafts stay private, and release notes perform zero KV operations", async () => {
  const db = createLocalD1(":memory:");
  let kvOps = 0;
  const env = {
    DB: db,
    DISCORD_BOT: {
      async get() {
        kvOps++;
        return null;
      },
      async put() {
        kvOps++;
      },
    },
  };
  try {
    const base = DEFAULT_RELEASE_NOTES[0];
    await saveReleaseNote(env, {
      ...base,
      version: "v0.3.0",
      title: "Draft update",
      published: false,
    });
    assert.equal(
      (await getReleaseNotes(env)).some((note) => note.version === "v0.3.0"),
      false,
    );
    assert.equal(
      (await getReleaseNotes(env, true)).some(
        (note) => note.version === "v0.3.0",
      ),
      true,
    );
    await saveReleaseNote(env, {
      ...base,
      version: "v0.3.0",
      title: "Published update",
      published: true,
    });
    await saveReleaseNote(env, {
      ...base,
      version: "v0.4.0",
      title: "Next update",
      published: true,
    });
    await saveReleaseNote(env, {
      ...base,
      version: "v0.3.0",
      title: "Revised update",
      published: true,
    });
    const publicNotes = await getReleaseNotes(env);
    assert.equal(
      publicNotes.find((note) => note.version === "v0.3.0")?.title,
      "Revised update",
    );
    assert.equal(
      publicNotes.find((note) => note.version === "v0.4.0")?.title,
      "Next update",
    );
    await saveReleaseNote(env, { ...base, published: false });
    assert.equal(
      (await getReleaseNotes(env)).some(
        (note) => note.version === base.version,
      ),
      false,
      "unpublished seed content must not reappear as a default",
    );
    assert.equal(kvOps, 0);
  } finally {
    db.close();
  }
});

test("member changelog requires login and only administrators can add or update versions", async () => {
  const db = createLocalD1(":memory:");
  const secret = "release-note-test-secret";
  const env = {
    DB: db,
    DISCORD_CLIENT_SECRET: secret,
    DISCORD_PRIMARY_ADMINISTRATOR: "151037568484507648",
  };
  try {
    const member = await createSessionToken(
      "555555555555555555",
      "member",
      "",
      secret,
    );
    const admin = await createSessionToken(
      "151037568484507648",
      "admin",
      "",
      secret,
    );
    const request = async (
      path: string,
      method: string,
      token?: string,
      body?: unknown,
    ) => {
      const url = new URL(path, "https://portal.example");
      return handleApiRequest(
        new Request(url, {
          method,
          headers: token ? { Cookie: `everfall_session=${token}` } : {},
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        env,
        url,
      );
    };
    assert.equal((await request("/api/changelog", "GET"))?.status, 401);
    assert.equal(
      (await request("/api/admin/changelog", "GET", member))?.status,
      403,
    );
    const draft = {
      ...DEFAULT_RELEASE_NOTES[0],
      version: "v1.2.3",
      title: "Private draft",
      published: false,
    };
    assert.equal(
      (await request("/api/admin/changelog", "POST", member, draft))?.status,
      403,
    );
    assert.equal(
      (await request("/api/admin/changelog", "POST", admin, draft))?.status,
      200,
    );
    assert.equal(
      (await request("/api/admin/changelog", "POST", admin, draft))?.status,
      409,
    );
    let response = await request("/api/changelog", "GET", member);
    assert.equal(
      JSON.stringify(await response?.json()).includes("Private draft"),
      false,
    );
    assert.equal(
      (
        await request("/api/admin/changelog", "PUT", admin, {
          ...draft,
          published: true,
        })
      )?.status,
      200,
    );
    response = await request("/api/changelog", "GET", member);
    assert.equal(
      JSON.stringify(await response?.json()).includes("Private draft"),
      true,
    );
  } finally {
    db.close();
  }
});
