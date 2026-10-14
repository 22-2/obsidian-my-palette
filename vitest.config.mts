import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: { src: path.resolve(import.meta.dirname, "src") },
	},
	test: {
		// Playwright owns e2e/; run it with `pnpm e2e`.
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
			reportsDirectory: "coverage/unit",
			reporter: ["text", "html", "lcov", "json"],
		},
	},
});
