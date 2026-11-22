import test from "node:test";
import assert from "node:assert/strict";
import { checkDependencyParity, parseJsonc } from "./check-lockfiles.mjs";

function fixture() {
  const manifest = { dependencies: { tsx: "^4.23.15" }, devDependencies: { wrangler: "^4.166.0" } };
  return {
    manifest,
    npm: { packages: { "": structuredClone(manifest) } },
    bun: { workspaces: { "": structuredClone(manifest) } },
  };
}

test("accepts synchronized dependency groups with JSONC lockfile syntax", () => {
  const { manifest, npm, bun } = fixture();
  const jsonc = `// Bun permits comments and trailing commas\n${JSON.stringify(bun).replace('"^4.23.15"}', '"^4.23.15",}')}`;
  assert.doesNotThrow(() => checkDependencyParity(manifest, npm, parseJsonc(jsonc, "bun.lock")));
});

test("rejects the reported tsx group move and missing wrangler in Bun", () => {
  const { manifest, npm, bun } = fixture();
  bun.workspaces[""].devDependencies = { tsx: manifest.dependencies.tsx };
  bun.workspaces[""].dependencies = {};
  assert.throws(() => checkDependencyParity(manifest, npm, bun), (error) => {
    assert.match(error.message, /bun.lock dependencies.tsx: expected \^4.23.15, found absent/);
    assert.match(error.message, /bun.lock devDependencies.tsx: expected absent/);
    assert.match(error.message, /bun.lock devDependencies.wrangler: expected \^4.166.0, found absent/);
    return true;
  });
});

test("rejects stale npm versions and missing lockfile roots", () => {
  const { manifest, npm, bun } = fixture();
  npm.packages[""].dependencies.tsx = "^4.20.0";
  assert.throws(() => checkDependencyParity(manifest, npm, bun), /package-lock.json dependencies.tsx/);
  assert.throws(() => checkDependencyParity(manifest, npm, {}), /bun.lock: missing root workspace/);
});

test("reports malformed JSONC instead of skipping the check", () => {
  assert.throws(() => parseJsonc('{"workspaces":', "bun.lock"), /bun.lock:/);
});
