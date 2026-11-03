// Brings a FREE (MIT) UIArc registry item into src/components/sites/uiarc/<name>/ the way the repo's own parts are written.
//   node scripts/uiarc/port.mjs <name> [<name> ...] [--dry]
// It fetches https://uiarc.dev/r/<name>.json, renames the files (<Pascal>.tsx, <name>.module.css), points motion tokens at ../motion-tokens, maps the
// registry's CSS variables to the repo's --arc-* tokens, and REPORTS what it cannot decide: sibling components it imports (install those first),
// packages missing from package.json, and tokens missing from arc-tokens.css. Pro items return 404 without a token and are never reconstructed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const target = join(root, "src", "components", "sites", "uiarc");
const names = process.argv.slice(2).filter(arg => !arg.startsWith("--")), dry = process.argv.includes("--dry");
if (!names.length) { console.error("usage: node scripts/uiarc/port.mjs <name> [--dry]"); process.exit(2); }
const packages = JSON.parse(readFileSync(join(root, "package.json"), "utf8")), have = { ...packages.dependencies, ...packages.devDependencies };
const tokensCss = readFileSync(join(target, "arc-tokens.css"), "utf8");
const pascal = name => name.replace(/(^|-)(\w)/g, (_, __, ch) => ch.toUpperCase());
/** `var(--foo)` of the registry -> `var(--arc-foo)`; the component's own private variables (--fbg-..., --ebg-...) keep their names. */
const mapVars = css => css.replace(/var\(--([a-z0-9-]+)/g, (whole, name) => /^(fbg|ebg|fade|icon-morph|side|tip)/.test(name) ? whole : `var(--arc-${name}`);

let failed = false;
for (const name of names) {
  const response = await fetch(`https://uiarc.dev/r/${name}.json`);
  if (!response.ok) { console.error(`${name}: HTTP ${response.status}. Not a free registry item (Pro items are token-gated and are not reconstructed).`); failed = true; continue; }
  const item = await response.json(), out = [], notes = [];
  for (const file of item.files ?? []) {
    const base = file.path.split("/").pop(), isCss = base.endsWith(".css"), isTsx = base.endsWith(".tsx") || base.endsWith(".ts");
    let text = file.content;
    if (isCss) {
      text = mapVars(text);
      for (const token of new Set([...text.matchAll(/var\(--(arc-[a-z0-9-]+)/g)].map(match => match[1]))) if (!tokensCss.includes(`--${token}:`)) notes.push(`token --${token} is not in arc-tokens.css`);
    } else if (isTsx) {
      text = text.replace(/"\.\.\/lib\/motion-tokens"/g, '"../motion-tokens"');
      for (const [, from] of text.matchAll(/from "(\.\.\/[^"]+)"/g)) if (from !== "../motion-tokens") notes.push(`imports sibling "${from}": port it first or remove the use`);
    }
    out.push({ path: join(target, name, isTsx && !base.includes(".module") ? `${pascal(name)}${base.endsWith(".ts") && !base.endsWith(".tsx") ? ".ts" : ".tsx"}` : base), text });
  }
  for (const dependency of item.dependencies ?? []) if (!have[dependency]) notes.push(`package "${dependency}" is not installed`);
  for (const file of out) { if (!dry) { mkdirSync(dirname(file.path), { recursive: true }); writeFileSync(file.path, file.text); } console.log(`${dry ? "would write" : "wrote"} ${file.path.slice(root.length + 1)}`); }
  for (const note of notes) console.warn(`  ! ${name}: ${note}`);
  if (notes.length) failed = true;
}
process.exit(failed ? 1 : 0);
