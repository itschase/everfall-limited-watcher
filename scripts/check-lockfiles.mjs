import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export function parseJsonc(text, filename) {
  const parsed = ts.parseConfigFileTextToJson(filename, text);
  if (parsed.error) {
    throw new Error(`${filename}: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n")}`);
  }
  return parsed.config;
}

export function checkDependencyParity(manifest, npmLock, bunLock) {
  const roots = [
    ["package-lock.json", npmLock?.packages?.[""]],
    ["bun.lock", bunLock?.workspaces?.[""]],
  ];
  const errors = [];
  for (const [filename, root] of roots) {
    if (!root) {
      errors.push(`${filename}: missing root workspace`);
      continue;
    }
    for (const group of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      const expected = manifest[group] || {};
      const actual = root[group] || {};
      for (const name of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
        if (expected[name] !== actual[name]) {
          errors.push(`${filename} ${group}.${name}: expected ${expected[name] ?? "absent"}, found ${actual[name] ?? "absent"}`);
        }
      }
    }
  }
  if (errors.length) {
    throw new Error(`Dependency lockfile mismatch:\n${errors.join("\n")}\nRegenerate with bun install and npm install --package-lock-only; commit both changed lockfiles.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const read = (name) => parseJsonc(fs.readFileSync(name, "utf8"), name);
  checkDependencyParity(read("package.json"), read("package-lock.json"), read("bun.lock"));
  console.log("Manifest dependency versions and groups match both lockfiles.");
}
