import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    /**
     * Unidirectional imports, from bulletproof-react.
     *
     * Its rule is that code flows one way — shared → features → app — and that
     * shared code never reaches back into the layer that composes it. This
     * codebase has no src/features directory: the App Router already gives
     * feature colocation, so a route's own pieces live beside it in
     * app/<route>/_components and _shared.ts. The boundary that matters here is
     * therefore the outer one.
     *
     * It was already being crossed three times — lib/markdown-view,
     * components/WebMcpTools and components/BiodataView each imported from
     * app/profiles/_shared. That is what makes a "shared" module quietly
     * depend on one route's internals: move or delete the route and unrelated
     * code breaks. The types and helpers they wanted now live in src/types and
     * src/lib, and _shared re-exports them so the route reads unchanged.
     */
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: ["./src/components", "./src/lib", "./src/types"],
              from: "./src/app",
              message:
                "Shared code must not import from app/. Move what you need into src/lib or src/types and re-export it from the route if the route still wants it.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
