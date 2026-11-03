// Guards the clone of UIArc's Button: the tokens are the ones read from the page, and every token a stylesheet uses is defined.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { motionTokens } from "../motion-tokens.ts";

const read = name => readFileSync(new URL(name, import.meta.url), "utf8");
const tokens = read("../arc-tokens.css"), skin = read("./ui-button.css"), moduleCss = read("./button.module.css");
const defined = new Set([...tokens.matchAll(/(--arc-[a-z0-9-]+)\s*:/g)].map(match => match[1]));

test("the sizes, radius and timings are the ones declared by https://uiarc.dev/components/button", () => {
  for (const [name, value] of Object.entries({ "control-height-sm": "2.25rem", "control-height-md": "2.75rem", "control-height-lg": "3.125rem", "radius-control": "1.125rem", "duration-fast": "0.16s", "duration-instant": "0.12s", "ease-standard": "cubic-bezier(0.22, 1, 0.36, 1)" }))
    assert.ok(new RegExp(`--arc-${name}:\\s*${value.replace(/[().]/g, "\\$&")}`).test(tokens), name);
  assert.deepEqual(motionTokens.ease.standard, [0.22, 1, 0.36, 1]);
  assert.equal(motionTokens.duration.fast, 0.16);
  assert.deepEqual(motionTokens.spring.snappy, { type: "spring", visualDuration: 0.26, bounce: 0 });
});

test("every --arc- token the button stylesheets use is defined, and the vendored module uses no unprefixed token", () => {
  const used = new Set([...skin.matchAll(/var\((--arc-[a-z0-9-]+)/g), ...moduleCss.matchAll(/var\((--arc-[a-z0-9-]+)/g)].map(match => match[1]));
  for (const name of used) assert.ok(defined.has(name), `${name} is used but not defined`);
  assert.deepEqual([...moduleCss.matchAll(/var\((--(?!arc-)[a-z-]+)/g)].map(match => match[1]), []);
});

test("hover only applies to fine pointers, a disabled outlined button keeps its shape, focus is keyboard only", () => {
  assert.match(skin, /@media \(hover: hover\) and \(pointer: fine\)\s*\{[^@]*\.ui-button\[data-variant="secondary"\]:hover/);
  assert.match(skin, /\.ui-button\[data-variant="secondary"\]:disabled[^{]*\{ opacity: 1;/);
  assert.match(skin, /\.ui-button:focus-visible\s*\{ outline: 2px solid var\(--arc-focus\)/);
  assert.ok(!/\.ui-button:focus\s*\{/.test(skin));
});
