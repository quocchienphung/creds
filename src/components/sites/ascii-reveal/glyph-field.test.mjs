import { test } from "node:test";
import assert from "node:assert/strict";
import { CELL_MS, COVER, MAX_CELLS, MAX_REVEAL_MS, delayOf, distance, gridFor, hash, loadingCell, presets, revealCell, revealDuration } from "./glyph-field.ts";

const wave = (origin, width = 900, height = 600, x, y) => ({ origin, width, height, x, y });

test("the grid never has more than MAX_CELLS cells, however large the window", () => {
  for (const [w, h] of [[300, 200], [1440, 900], [2560, 1440], [7680, 4320], [20000, 20000]]) {
    const grid = gridFor(w, h);
    assert.ok(grid.cols * grid.rows <= MAX_CELLS * 1.12, `${w}×${h} gave ${grid.cols * grid.rows} cells`);
    assert.ok(grid.cols * grid.cellW >= w && grid.rows * grid.cellH >= h, "the grid covers the region");
  }
});

test("the hash is stable and spread over [0, 1)", () => {
  assert.equal(hash(3, 4, 5), hash(3, 4, 5));
  const values = Array.from({ length: 2000 }, (_, index) => hash(index % 50, Math.floor(index / 50), 1));
  assert.ok(values.every(value => value >= 0 && value < 1));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(mean > 0.45 && mean < 0.55, `mean ${mean}`);
});

test("the wave starts at its origin and reaches the farthest cell last", () => {
  const grid = gridFor(900, 600);
  const centre = wave("center");
  const nearCentre = distance(Math.floor(grid.cols / 2), Math.floor(grid.rows / 2), grid, centre);
  const corner = distance(0, 0, grid, centre);
  assert.ok(nearCentre < 0.05 && corner > 0.95);
  const fromCorner = wave("corner");
  assert.ok(distance(0, 0, grid, fromCorner) < 0.03 && distance(grid.cols - 1, grid.rows - 1, grid, fromCorner) > 0.97);
  const pointer = wave("cursor", 900, 600, 100, 500);
  assert.ok(distance(Math.floor(100 / grid.cellW), Math.floor(500 / grid.cellH), grid, pointer) < 0.05);
  assert.ok(distance(0, 0, grid, wave("cursor", 900, 600, -400, 9999)) <= 1, "a pointer outside the region is clamped into it");
});

test("a faster speed starts every cell sooner and shortens the reveal, which never exceeds the cap", () => {
  const grid = gridFor(900, 600);
  for (const preset of presets) {
    assert.ok(delayOf(preset, 20, 10, grid, wave("center"), 2) < delayOf(preset, 20, 10, grid, wave("center"), 1), preset);
  }
  assert.ok(revealDuration(2) < revealDuration(1));
  assert.ok(revealDuration(0.01) <= MAX_REVEAL_MS && revealDuration(1) <= MAX_REVEAL_MS);
});

test("every cell ends fully transparent: the reveal always uncovers the whole page", () => {
  const grid = gridFor(1200, 800);
  const speed = 1;
  const end = revealDuration(speed) + 5;
  for (const preset of presets) for (const origin of ["center", "corner", "cursor"]) {
    const w = wave(origin, 1200, 800, 300, 200);
    for (let row = 0; row < grid.rows; row += 3) for (let col = 0; col < grid.cols; col += 3) {
      const cell = revealCell(preset, col, row, grid, w, speed, end);
      assert.equal(cell.cover, 0, `${preset}/${origin} ${col},${row} still covers the page at the end`);
      assert.equal(cell.glyph, "", `${preset}/${origin} ${col},${row} still draws a glyph at the end`);
    }
  }
});

test("the first frame of the reveal is the loading field (no jump when the wait ends), and the cover only ever decreases", () => {
  const grid = gridFor(900, 600), w = wave("center");
  for (const preset of presets) {
    const far = { col: grid.cols - 1, row: grid.rows - 1 };
    const before = loadingCell(preset, far.col, far.row, grid, w, 0);
    const first = revealCell(preset, far.col, far.row, grid, w, 1, 0);
    assert.equal(first.cover, before.cover, preset);
    assert.equal(before.cover, COVER, preset);
    // the dissolve of one cell: cover never grows
    const delay = delayOf(preset, 10, 10, grid, w, 1);
    let previous = Infinity;
    for (let t = delay; t <= delay + CELL_MS; t += 20) {
      const { cover } = revealCell(preset, 10, 10, grid, w, 1, t);
      assert.ok(cover <= previous + 1e-9, `${preset} cover grew at ${t}`);
      previous = cover;
    }
  }
});

test("glyphs come from fixed sets, never from the page: only printable ASCII", () => {
  const grid = gridFor(600, 400), w = wave("center");
  for (const preset of presets) for (let t = 0; t < 3000; t += 137) for (let row = 0; row < grid.rows; row += 2) for (let col = 0; col < grid.cols; col += 2) {
    for (const cell of [loadingCell(preset, col, row, grid, w, t), revealCell(preset, col, row, grid, w, 1, t)]) {
      assert.ok(/^[\x20-\x7e]*$/.test(cell.glyph) && cell.glyph.length <= 1, `${preset}: ${JSON.stringify(cell.glyph)}`);
      assert.ok(cell.ink >= 0 && cell.ink <= 1 && cell.cover >= 0 && cell.cover <= 1, `${preset}: out-of-range opacity`);
    }
  }
});
