import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import convexPlugin from "@convex-dev/eslint-plugin";

export default defineConfig([
  // Vendored third-party bundles (OCR/PDF WASM workers) served statically.
  { ignores: ["public/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  ...convexPlugin.configs.recommended,
]);
