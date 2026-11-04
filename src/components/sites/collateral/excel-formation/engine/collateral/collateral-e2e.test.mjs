// Collateral descriptions (not addresses) through the whole one-click repair, on a workbook that has nothing to do with MAU9 and holds no clean copy of
// these phrases. Expected strings are the spec's regression matrix (docs/MASTER_PROMPT_COLLATERAL_INTELLIGENCE_RECOVERY.md section 12): TESTS, not mappings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildXlsx } from "../xlsx-builder.mjs";
import { openSession } from "../session.ts";
import { emptyReview } from "../review.ts";
import { autoRepair } from "../auto-repair.ts";
import { UNCALIBRATED } from "../geo/address-recovery.ts";
import { knowledge, loadDataset } from "../geo/geo-fixture.mjs";

const verifier = join(dirname(fileURLToPath(import.meta.url)), "..", "independent-xlsx-dump.py");
const python = ["python3", "python"].find(name => spawnSync(name, ["--version"]).status === 0) ?? null;
function dump(bytes) {
  assert.ok(python || process.env.ALLOW_NO_PYTHON === "1", "independent verifier unavailable");
  if (!python) return null;
  const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
  try { const file = join(dir, "out.xlsx"); writeFileSync(file, bytes); const r = spawnSync(python, ["-I", verifier, file], { encoding: "utf8", maxBuffer: 1 << 28 }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
const geo = () => ({ knowledge: knowledge(), calibration: UNCALIBRATED, datasetVersion: loadDataset().manifest.datasetVersion });

const MATRIX = [
  ["Quy?n s? d?ng d?t", "Quyen su dung dat"], ["T?i s?n g?n li?n v?i d?t", "Tai san gan lien voi dat"], ["Nha ? h?nh thanh trong tuong lai", "Nha o hinh thanh trong tuong lai"],
  ["C?n h? chung cu", "Can ho chung cu"], ["S? ti?t ki?m", "So tiet kiem"], ["M?y m?c thi?t b?", "May moc thiet bi"], ["Xe ? to t?i", "Xe o to tai"],
  ["Hang t?n kho", "Hang ton kho"], ["Quy?n ph?t sinh t? h?p d?ng", "Quyen phat sinh tu hop dong"], ["D?ng s? h?u", "Dong so huu"],
  ["G?y ch?ng nh?n", "Giay chung nhan"], ["B?m b? tong c?n", "Bom be tong can"],
];

test("FORCE: every collateral phrase of the matrix is completed without ?, on a workbook with no clean copy, and the exported file agrees", async () => {
  const bytes = buildXlsx([{ name: "Tai san", rows: [["Mo ta"], ...MATRIX.map(([bad]) => [bad])] }]);
  const out = await autoRepair(await openSession(bytes, "ts.xlsx"), emptyReview(), { geo: geo(), policy: "FORCE_NO_QUESTION_MARK", collateral: true });
  const after = dump(bytes && out.bytes);
  if (!after) return;
  const wrong = MATRIX.flatMap(([bad, want], i) => after["Tai san!A" + (i + 2)] === want ? [] : [`${bad} => ${after["Tai san!A" + (i + 2)]} (want ${want})`]);
  assert.deepEqual(wrong, []);
});
