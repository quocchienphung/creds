import { access, copyFile, mkdir } from 'node:fs/promises';
// The local worker must have the same version as the installed PDF.js parser.
const files = [['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'public/storage/pdf.worker.min.mjs'], ['node_modules/pdfjs-dist/LICENSE', 'public/storage/pdfjs-LICENSE']];
const exists = path => access(path).then(() => true, () => false);
await mkdir('public/storage', { recursive: true });
for (const [from, to] of files) {
  if (await exists(from)) { await copyFile(from, to); continue; }
  // `npm install` has not been run since pdfjs-dist was added. Keep `npm run dev` alive when an earlier copy exists, but say so.
  if (await exists(to)) { console.warn(`storage-assets: ${from} is missing (run "npm install"); keeping the existing ${to}.`); continue; }
  console.error(`storage-assets: ${from} is missing and there is no copy at ${to}. Run "npm install" first.`);
  process.exitCode = 1;
}
