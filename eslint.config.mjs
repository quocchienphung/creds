import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  {
    // The Stripe reconstruction mirrors the reference's <img srcset> markup byte-for-byte.
    files: ["src/components/stripe/**/*.tsx", "src/components/sites/**/*.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Frozen reference bundles captured for forensics, not project code.
    "docs/**",
    // PDF.js worker copied verbatim from its installed package by scripts/storage-assets.mjs.
    "public/storage/pdf.worker.min.mjs",
    // Builder-agent git worktrees (each has its own checkout and .next output).
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
