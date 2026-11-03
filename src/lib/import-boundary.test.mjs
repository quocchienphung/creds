import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// `.dockerignore` leaves out scripts/ and docs/, so the production image build only has what src/ imports from inside itself.
const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = /\.(?:[cm]?[jt]s|tsx|jsx)$/;
const testFile = /\.test\.[cm]?[jt]s$/;
const relativeImport = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["'](\.{1,2}\/[^"']*)["']/g;

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (sourceFile.test(entry.name) && !testFile.test(entry.name)) yield full;
  }
}

test("app code under src/ never imports a file from outside src/", () => {
  const escaping = [];
  for (const file of walk(srcRoot)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(relativeImport)) {
      const target = path.resolve(path.dirname(file), match[1]);
      if (path.relative(srcRoot, target).startsWith("..")) escaping.push(`${path.relative(srcRoot, file)} -> ${match[1]}`);
    }
  }
  assert.deepEqual(escaping, [], "These imports would break the Docker build, where scripts/ and docs/ are not copied.");
});
