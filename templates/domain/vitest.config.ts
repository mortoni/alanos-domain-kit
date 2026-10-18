import { defineConfig } from "vitest/config";

/**
 * Tests that load this repository's real data rather than a fixture. Inside
 * the sandbox the private folders refuse even a directory listing (see
 * .claude/settings.json), so these never run in `pnpm check`.
 */
export const DATA_TESTS: string[] = [];

/**
 * Tests are looked for in tests/ only: by default vitest walks the whole
 * repository, private folders included. `envDir: false` because vite reads
 * .env by default, and the sandbox refuses it.
 */
export default defineConfig({
  envDir: false,
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: DATA_TESTS,
  },
});
