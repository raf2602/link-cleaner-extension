import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const referencedFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
];

const missing = [];
for (const path of new Set(referencedFiles)) {
  try { await stat(join(root, path)); }
  catch { missing.push(path); }
}

if (missing.length) {
  console.error(`Missing manifest files:\n${missing.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Manifest ${manifest.version} is valid; ${new Set(referencedFiles).size} referenced files exist.`);
}
