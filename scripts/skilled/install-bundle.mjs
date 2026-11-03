#!/usr/bin/env node
/** CLI for the offline installer; the implementation lives in src/lib/server/install-bundle.mjs (the app imports it from there). */
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installBundle } from "../../src/lib/server/install-bundle.mjs";

export { installBundle, validateBundle } from "../../src/lib/server/install-bundle.mjs";

async function main() {
  const args = process.argv.slice(2); let input; let directory = "./my-agent-skills"; let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir") { if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("--dir requires a path."); directory = args[++i]; }
    else if (args[i] === "--force") force = true;
    else if (args[i].startsWith("--") || input) throw new Error("Usage: node scripts/skilled/install-bundle.mjs manifest.json [--dir ./my-agent-skills] [--force]");
    else input = args[i];
  }
  if (!input) throw new Error("Usage: node scripts/skilled/install-bundle.mjs manifest.json [--dir ./my-agent-skills] [--force]");
  const stat = await lstat(input); if (!stat.isFile() || stat.size > 60 * 1024 * 1024) throw new Error("Manifest must be a JSON file smaller than 60 MiB.");
  const result = await installBundle(JSON.parse(await readFile(input, "utf8")), { directory, force });
  console.log(`Installed ${result.receipt.accepted.length} skills and their captured supporting files (${result.receipt.bytes} verified bytes) in ${result.directory}.`);
  console.log("Read README.md, configure your agent to load LOGIO.md + SKILL.md, and import transfer-receipt.json into Logio to record file delivery.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
