import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { parseWebsiteReleases } from "./parse-release-notes";

const source = new URL("../CHANGELOG.md", import.meta.url);
const target = new URL("../src/shared/publishedReleaseNotes.json", import.meta.url);
const output = JSON.stringify(parseWebsiteReleases(fs.readFileSync(source, "utf8")), null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") !== output)
    throw new Error("Website release notes are stale. Run npm run changelog:generate and commit the generated file.");
} else {
  fs.writeFileSync(fileURLToPath(target), output);
}
