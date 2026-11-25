import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Each Collateral section keeps three layers apart: engine/ (pure logic, also runs in the worker), model/ (state, I/O, view-models) and ui/ (JSX, CSS, motion).
// engine/ may not reach into model/ or ui/ or any UI library; model/ may not reach into ui/. See README.md in this folder.
const root = path.dirname(fileURLToPath(import.meta.url));
const uiLibraries = /^(?:react-dom(?:\/.*)?|motion(?:\/.*)?|lucide-react|next(?:\/.*)?)$/;
const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(?:[cm]?[jt]s|tsx)$/.test(entry.name) && !/\.test\.[cm]?[jt]s$/.test(entry.name)) yield full;
  }
}
const layerOf = file => path.relative(root, file).split(path.sep).find(part => part === "engine" || part === "model" || part === "ui") ?? null;

function violations(layer, forbidden) {
  const found = [];
  for (const file of walk(root)) {
    if (layerOf(file) !== layer) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(specifier)) {
      const target = match[1];
      const resolved = target.startsWith(".") ? path.relative(root, path.resolve(path.dirname(file), target)).split(path.sep) : [];
      if (forbidden(target, resolved)) found.push(`${path.relative(root, file)} -> ${target}`);
    }
  }
  return found;
}
const intoLayer = (resolved, layers) => resolved.some(part => layers.includes(part));
const css = target => /\.css$/.test(target);

test("engine/ imports no React, motion, icons, CSS, @/ alias, model/ or ui/", () => {
  assert.deepEqual(violations("engine", (target, resolved) => uiLibraries.test(target) || target === "react" || target.startsWith("@/") || css(target) || intoLayer(resolved, ["model", "ui"])), []);
});

test("model/ imports no motion, icons, CSS or ui/", () => {
  assert.deepEqual(violations("model", (target, resolved) => /^(?:motion(?:\/.*)?|lucide-react)$/.test(target) || css(target) || intoLayer(resolved, ["ui"])), []);
});
